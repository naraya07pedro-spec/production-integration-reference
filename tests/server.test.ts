import assert from "node:assert/strict";
import test from "node:test";
import {once} from "node:events";
import {createIntegrationServer} from "../src/server.js";
import {signPayload} from "../src/webhook.js";
import {MemoryStore,logger,lead} from "./helpers.js";
test("real ingress rejects malformed/auth/body limits before side effects",async t=>{
 let calls=0;const secret="local-test-only";
 const server=createIntegrationServer({webhookSecret:secret,store:new MemoryStore(),logger,
 downstream:{async sendLead(){calls++;return {externalId:null};}}});
 server.listen(0,"127.0.0.1");await once(server,"listening");t.after(()=>{server.closeAllConnections();server.close();});
 const url="http://127.0.0.1:"+(server.address() as {port:number}).port+"/events/lead";
 const send=(body:string,signature=signPayload(body,secret))=>fetch(url,{method:"POST",headers:{"x-webhook-signature":signature},body});
 assert.equal((await send(JSON.stringify(lead),"invalid")).status,401);
 assert.equal((await send("{")).status,400);
 assert.equal((await send("null")).status,422);
 assert.equal((await send("x".repeat(65537))).status,413);
 assert.equal(calls,0);
 const response=await send(JSON.stringify(lead));assert.equal(response.status,200);assert.equal((await response.json()).status,"sent");
 assert.equal(calls,1);
});
