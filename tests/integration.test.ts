import assert from "node:assert/strict";
import test from "node:test";
import { processLeadEvent, buildIdempotencyKey, normalizeLead } from "../src/handler.js";
import { HttpError } from "../src/retry.js";
import { MemoryStore, logger, lead, immediate } from "./helpers.js";

test("normalizes, reserves before sending, and blocks sequential replay with changed email", async()=>{
 const store=new MemoryStore(); let calls=0;
 const downstream={async sendLead(payload: ReturnType<typeof normalizeLead>,key:string) {
   calls++; assert.equal(store.states.get(key),"RESERVED"); assert.equal(payload.email,"buyer@example.test");
   return {externalId:"demo-response"};
 }};
 assert.equal((await processLeadEvent(lead,{store,downstream,logger})).status,"sent");
 assert.equal((await processLeadEvent({...lead,email:"changed@example.test"},{store,downstream,logger})).status,"duplicate");
 assert.equal(calls,1);
});
test("concurrent contenders acquire one reservation",async()=>{
 const store=new MemoryStore(); let calls=0;
 const downstream={async sendLead(){calls++; return {externalId:null};}};
 const results=await Promise.all(Array.from({length:12},()=>processLeadEvent(lead,{store,downstream,logger})));
 assert.equal(results.filter(r=>r.status==="sent").length,1); assert.equal(calls,1);
});
test("transient failure retries then persists success",async()=>{
 const store=new MemoryStore(); let calls=0;
 const downstream={async sendLead(){if(++calls<3) throw new HttpError(503); return {externalId:null};}};
 assert.equal((await processLeadEvent(lead,{store,downstream,logger},immediate)).status,"sent");
 assert.equal(calls,3); assert.equal([...store.states.values()][0],"SENT");
});
for(const status of [400,401,403,404,422,503]) test("persists exhausted/permanent failure "+status,async()=>{
 const store=new MemoryStore(); let calls=0;
 const downstream={async sendLead(){calls++;throw new HttpError(status);}};
 await assert.rejects(processLeadEvent(lead,{store,downstream,logger},immediate));
 assert.equal(calls,status===503?3:1); assert.equal([...store.states.values()][0],"FAILED");
 assert.equal((await processLeadEvent(lead,{store,downstream,logger})).status,"duplicate");
});
for(const input of [null,[],42,"x",{...lead,id:{}},{...lead,email:"bad"},{...lead,region:"US"}])
 test("invalid input blocked before reservation: "+JSON.stringify(input),async()=>{
 const store=new MemoryStore(); let calls=0;
 const result=await processLeadEvent(input,{store,downstream:{async sendLead(){calls++;return {externalId:null};}},logger});
 assert.equal(result.status,"blocked");assert.equal(store.states.size,0);assert.equal(calls,0);
});
test("state persistence failure after downstream success preserves RESERVED",async()=>{
 const store=new MemoryStore();store.markSent=async()=>{throw new Error("database unavailable");};
 await assert.rejects(processLeadEvent(lead,{store,downstream:{async sendLead(){return {externalId:null};}},logger}));
 assert.equal([...store.states.values()][0],"RESERVED");
});
test("reservation failure prevents downstream",async()=>{
 const store=new MemoryStore();store.reserve=async()=>{throw new Error("database unavailable");};let calls=0;
 await assert.rejects(processLeadEvent(lead,{store,downstream:{async sendLead(){calls++;return {externalId:null};}},logger}));
 assert.equal(calls,0);
});
test("structured logs omit payload, provider ID, and error messages",async()=>{
 const records:unknown[]=[];const log={info:(...args:unknown[])=>{records.push(args);},error:(...args:unknown[])=>{records.push(args);}};
 const store=new MemoryStore();
 await assert.rejects(processLeadEvent(lead,{store,logger:log,downstream:{async sendLead(){throw new Error("private-provider-body");}}}));
 const output=JSON.stringify(records);
 for(const value of [lead.email,lead.message,"private-provider-body"]) assert.ok(!output.includes(value));
});
test("tuple identity avoids delimiter collision",()=>{
 assert.notEqual(buildIdempotencyKey(normalizeLead({...lead,source:"a|b",id:"c"})),buildIdempotencyKey(normalizeLead({...lead,source:"a",id:"b|c"})));
});
