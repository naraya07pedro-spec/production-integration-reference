import assert from "node:assert/strict";
import test from "node:test";
import {signPayload,verifyWebhookSignature} from "../src/webhook.js";
const body=Buffer.from('{"id":"demo-001"}'); const secret="local-test-only";
const now=1700000000, timestamp=String(now);

test("valid timestamp-bound signature and uppercase hex accepted",()=>{
 const signature=signPayload(body,secret,timestamp);
 assert.equal(verifyWebhookSignature(body,signature,secret,timestamp,now),true);
 assert.equal(verifyWebhookSignature(body,signature.toUpperCase(),secret,timestamp,now),true);
});
test("altered body or header timestamp rejects before processing",()=>{
 const signature=signPayload(body,secret,timestamp);
 assert.equal(verifyWebhookSignature(Buffer.concat([body,Buffer.from(" ")]),signature,secret,timestamp,now),false);
 assert.equal(verifyWebhookSignature(body,signature,secret,String(now+1),now),false);
});
test("expired and future-dated signed requests fail closed",()=>{
 for(const seconds of [now-301,now+301]){
   const stamp=String(seconds);
   assert.equal(verifyWebhookSignature(body,signPayload(body,secret,stamp),secret,stamp,now),false);
 }
 for(const seconds of [now-300,now+300]){
   const stamp=String(seconds);
   assert.equal(verifyWebhookSignature(body,signPayload(body,secret,stamp),secret,stamp,now),true);
 }
});
for(const invalid of [undefined,"","0".repeat(64),"z".repeat(64),"0".repeat(65)]){
 test("invalid signature "+invalid?.slice(0,4),()=>
   assert.equal(verifyWebhookSignature(body,invalid,secret,timestamp,now),false));
}
for(const invalid of [undefined,"","abc","17000000000","1700000000 ","0000000000"]){
 test("invalid timestamp "+invalid,()=>
   assert.equal(verifyWebhookSignature(body,signPayload(body,secret,timestamp),secret,invalid,now),false));
}
test("empty secret rejected",()=>
 assert.equal(verifyWebhookSignature(body,signPayload(body,"",timestamp),"",timestamp,now),false));
