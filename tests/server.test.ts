import assert from "node:assert/strict";
import test from "node:test";
import {once} from "node:events";
import {createIntegrationServer} from "../src/server.js";
import {signPayload} from "../src/webhook.js";
import {MemoryStore,logger,lead} from "./helpers.js";
test("real ingress rejects malformed/auth/body limits before side effects",async t=>{
 let calls=0;const secret="local-test-only";
 const server=createIntegrationServer({webhookSecret:secret,trustedSource:"demo",store:new MemoryStore(),logger,
 downstream:{async sendLead(){calls++;return {externalId:null};}}});
 server.listen(0,"127.0.0.1");await once(server,"listening");t.after(()=>{server.closeAllConnections();server.close();});
 const url="http://127.0.0.1:"+(server.address() as {port:number}).port+"/events/lead";
 const timestamp=String(Math.floor(Date.now()/1000));
 const send=(body:string,signature=signPayload(body,secret,timestamp),stamp=timestamp)=>
   fetch(url,{method:"POST",headers:{"x-webhook-signature":signature,"x-webhook-timestamp":stamp},body});
 assert.equal((await send(JSON.stringify(lead),"invalid")).status,401);
 assert.equal((await send(JSON.stringify(lead),signPayload(JSON.stringify(lead),secret,timestamp),String(Number(timestamp)-301))).status,401);
 assert.equal((await send("{")).status,400);
 assert.equal((await send("null")).status,422);
 assert.equal((await send("x".repeat(65537))).status,413);
 assert.equal(calls,0);
 const response=await send(JSON.stringify(lead));assert.equal(response.status,200);assert.equal((await response.json()).status,"sent");
 assert.equal(calls,1);
});

test("server rejects spoofed source namespace before event reservation or HTTP side effects",async t=>{
 let sends=0;const store=new MemoryStore();const secret="local-test-only";
 const server=createIntegrationServer({webhookSecret:secret,trustedSource:"demo",store,logger,
  downstream:{async sendLead(){sends++;return {externalId:"synthetic"};}}});
 server.listen(0,"127.0.0.1");await once(server,"listening");
 t.after(()=>{server.closeAllConnections();server.close();});
 const url="http://127.0.0.1:"+(server.address() as {port:number}).port+"/events/lead";
 const post=async(payload:unknown,valid=true)=>{
  const body=JSON.stringify(payload);const timestamp=String(Math.floor(Date.now()/1000));
  const signature=valid?signPayload(body,secret,timestamp):"bad-signature";
  return fetch(url,{method:"POST",headers:{"x-webhook-signature":signature,"x-webhook-timestamp":timestamp},body});
 };
 const original={...lead,source:"demo"};
 const accepted=await post(original);assert.equal(accepted.status,200);
 assert.equal((await accepted.json()).status,"sent");
 assert.equal(sends,1);assert.equal(store.states.size,1);
 // HMAC valid: changing user input cannot grant a second namespace.
 const spoofed=await post({...original,source:"different"});
 assert.equal(spoofed.status,422);
 assert.deepEqual(await spoofed.json(),{error:"source_mismatch"});
 assert.equal(sends,1);assert.equal(store.states.size,1);
 // Authentication comes before source authorization.
 assert.equal((await post({...original,source:"different"},false)).status,401);
 // The original authorized source remains deduplicated even if email changes.
 const replay=await post({...original,email:"other@example.test",source:"DEMO"});
 assert.equal(replay.status,200);assert.equal((await replay.json()).status,"duplicate");
 assert.equal(sends,1);assert.equal(store.states.size,1);
});
test("server refuses unsafe or unspecified trusted source at startup",()=>{
 for(const source of ["","unknown","Demo","demo/other","a".repeat(101)]){
  assert.throws(()=>createIntegrationServer({webhookSecret:"s",trustedSource:source,
    store:new MemoryStore(),logger,downstream:{async sendLead(){return {externalId:null};}}}),
    /Invalid trusted webhook source configuration/);
 }
});
