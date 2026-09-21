import assert from "node:assert/strict";
import test from "node:test";
import {signPayload,verifyWebhookSignature} from "../src/webhook.js";
const body=Buffer.from('{"id":"demo-001"}'); const secret="local-test-only";
test("valid signature and uppercase hex accepted",()=>{
 const signature=signPayload(body,secret);
 assert.ok(verifyWebhookSignature(body,signature,secret));assert.ok(verifyWebhookSignature(body,signature.toUpperCase(),secret));
});
test("modified bytes rejected",()=>assert.equal(verifyWebhookSignature(Buffer.concat([body,Buffer.from(" ")]),signPayload(body,secret),secret),false));
for(const signature of [undefined,"","0".repeat(64),"z".repeat(64),"0".repeat(65)])
 test("invalid signature "+signature?.slice(0,4),()=>assert.equal(verifyWebhookSignature(body,signature,secret),false));
test("empty secret rejected",()=>assert.equal(verifyWebhookSignature(body,signPayload(body,""),""),false));
