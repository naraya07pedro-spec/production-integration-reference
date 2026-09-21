import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {randomUUID} from "node:crypto";
import {Pool} from "pg";
import {PostgresIdempotencyStore} from "../../src/idempotency.js";
import {processLeadEvent,normalizeLead,buildIdempotencyKey} from "../../src/handler.js";
import {HttpError} from "../../src/retry.js";
import {lead,logger,immediate} from "../helpers.js";

// Explicit opt-in: only point TEST_DATABASE_URL at a disposable test database.
test("PostgreSQL unique reservation, concurrent side effects, persistence and failure state",async()=>{
 if(!process.env.TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL must name a disposable test database");
 const schema="test_"+randomUUID().replaceAll("-","");
 const admin=new Pool({connectionString:process.env.TEST_DATABASE_URL});
 await admin.query('CREATE SCHEMA "'+schema+'"');
 const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,options:"-c search_path="+schema,max:12});
 try{
   await pool.query(await readFile(new URL("../../db/001_init.sql",import.meta.url),"utf8"));
   const store=new PostgresIdempotencyStore(pool);let calls=0;
   const downstream={async sendLead(){calls++;return {externalId:"synthetic-db-response"};}};
   const results=await Promise.all(Array.from({length:12},()=>processLeadEvent(lead,{store,downstream,logger})));
   assert.equal(calls,1);assert.equal(results.filter(r=>r.status==="sent").length,1);
   const rows=await pool.query("SELECT state,external_id FROM integration_events");
   assert.deepEqual(rows.rows,[{state:"SENT",external_id:"synthetic-db-response"}]);
   const freshPool=new Pool({connectionString:process.env.TEST_DATABASE_URL,options:"-c search_path="+schema});
   try{assert.equal((await processLeadEvent(lead,{store:new PostgresIdempotencyStore(freshPool),downstream,logger})).status,"duplicate");}
   finally{await freshPool.end();}
   const failed={...lead,id:"failed-db"};
   await assert.rejects(processLeadEvent(failed,{store,logger,downstream:{async sendLead(){throw new HttpError(400);}}},immediate));
   const failure=await pool.query("SELECT state,error_class FROM integration_events WHERE idempotency_key=$1",[buildIdempotencyKey(normalizeLead(failed))]);
   assert.deepEqual(failure.rows,[{state:"FAILED",error_class:"downstream_failure"}]);
 }finally{await pool.end();await admin.query('DROP SCHEMA "'+schema+'" CASCADE');await admin.end();}
});
