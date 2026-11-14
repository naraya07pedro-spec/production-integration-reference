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
   assert.deepEqual(failure.rows,[{state:"RESERVED",error_class:null}]);
   // A checked provider refusal, not an HTTP exception alone, authorizes the
   // operator to finalize FAILED. This explicit transition remains one-way.
   await store.markFailed(buildIdempotencyKey(normalizeLead(failed)),"provider_confirmed_rejection");

   const ambiguous={...lead,id:"uncertain-db"};
   const ambiguousKey=buildIdempotencyKey(normalizeLead(ambiguous));
   await assert.rejects(processLeadEvent(ambiguous,{store,logger,downstream:{
     async sendLead(){throw new HttpError(503);}
   }},immediate));
   const uncertain=await pool.query(
     "SELECT state,error_class FROM integration_events WHERE idempotency_key=$1",[ambiguousKey]);
   assert.deepEqual(uncertain.rows,[{state:"RESERVED",error_class:null}]);
   const replay=await processLeadEvent(ambiguous,{store,logger,downstream});
   assert.equal(replay.status,"duplicate");
   if(replay.status==="duplicate") assert.equal(replay.state,"RESERVED");

   // A missing reservation must never be reported as a successfully persisted outcome.
   const missingKey="missing-"+randomUUID();
   await assert.rejects(store.markSent(missingKey,"phantom"),/existing RESERVED event/);
   await assert.rejects(store.markFailed(missingKey,"downstream_failure"),/existing RESERVED event/);

   // An outcome that has already been finalized cannot be silently overwritten.
   const sentKey=buildIdempotencyKey(normalizeLead(lead));
   const failedKey=buildIdempotencyKey(normalizeLead(failed));
   await assert.rejects(store.markFailed(sentKey,"late_failure"),/existing RESERVED event/);
   await assert.rejects(store.markSent(failedKey,"late_success"),/existing RESERVED event/);
   const terminal=await pool.query(
     "SELECT idempotency_key,state FROM integration_events WHERE idempotency_key IN ($1,$2) ORDER BY idempotency_key",
     [sentKey,failedKey],
   );
   assert.deepEqual(new Map(terminal.rows.map(row=>[row.idempotency_key,row.state])),
     new Map([[sentKey,"SENT"],[failedKey,"FAILED"]]));

   // Simulate human/provider reconciliation winning while a worker is in flight.
   const reconciling={...lead,id:"reconciled-before-ack"};
   const reconcilingKey=buildIdempotencyKey(normalizeLead(reconciling));
   assert.equal((await store.reserve(reconcilingKey,normalizeLead(reconciling))).acquired,true);
   await pool.query("UPDATE integration_events SET state = 'FAILED' WHERE idempotency_key=$1",[reconcilingKey]);
   await assert.rejects(store.markSent(reconcilingKey,"late-provider-ack"),/existing RESERVED event/);
   const reconciled=await pool.query(
     "SELECT state,external_id FROM integration_events WHERE idempotency_key=$1",[reconcilingKey]);
   assert.deepEqual(reconciled.rows,[{state:"FAILED",external_id:null}]);
 }finally{await pool.end();await admin.query('DROP SCHEMA "'+schema+'" CASCADE');await admin.end();}
});
