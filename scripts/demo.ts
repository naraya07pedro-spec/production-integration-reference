import assert from "node:assert/strict";
import {createServer, type Server} from "node:http";
import {once} from "node:events";
import {randomUUID} from "node:crypto";
import {readFile} from "node:fs/promises";
import {Pool} from "pg";
import {createIntegrationServer} from "../src/server.js";
import {PostgresIdempotencyStore} from "../src/idempotency.js";
import {FetchDownstreamClient} from "../src/http-client.js";
import {signPayload} from "../src/webhook.js";

if(!process.env.TEST_DATABASE_URL) throw new Error("Set TEST_DATABASE_URL to a disposable demo database");
const schema="demo_"+randomUUID().replaceAll("-","");
const admin=new Pool({connectionString:process.env.TEST_DATABASE_URL});
await admin.query('CREATE SCHEMA "'+schema+'"');
const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,options:"-c search_path="+schema});
const servers:Server[]=[];
try{
 await pool.query(await readFile(new URL("../db/001_init.sql",import.meta.url),"utf8"));
 let calls=0;
 const downstream=createServer((_req,res)=>{calls++;res.writeHead(200,{"content-type":"application/json"}).end('{"id":"synthetic-response"}');});
 servers.push(downstream);downstream.listen(0,"127.0.0.1");await once(downstream,"listening");
 const port=(downstream.address() as {port:number}).port;
 const secret=randomUUID();
 const server=createIntegrationServer({store:new PostgresIdempotencyStore(pool),
   downstream:new FetchDownstreamClient("http://127.0.0.1:"+port,"local-demo-only"),
   webhookSecret:secret,logger:{info(){},error(){}}});
 servers.push(server);server.listen(0,"127.0.0.1");await once(server,"listening");
 const url="http://127.0.0.1:"+(server.address() as {port:number}).port+"/events/lead";
 const body=JSON.stringify({id:"synthetic-demo-001",email:"buyer@example.test",region:"ID",source:"demo"});
 const send=async()=>{
   const response=await fetch(url,{method:"POST",headers:{"x-webhook-signature":signPayload(body,secret)},body});
   assert.equal(response.status,200);return await response.json();
 };
 assert.equal((await send()).status,"sent");
 assert.equal((await send()).status,"duplicate");
 assert.equal(calls,1);
 console.log("SYNTHETIC LOCAL DEMO: signed intake -> PostgreSQL -> HTTP -> SENT; replay blocked.");
}finally{
 for(const server of servers){server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
 await pool.end();await admin.query('DROP SCHEMA "'+schema+'" CASCADE');await admin.end();
}
