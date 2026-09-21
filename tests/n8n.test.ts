import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
test("sanitized demo is inactive, credential-free, and signs the transmitted body",async()=>{
 const workflow=JSON.parse(await readFile(new URL("../n8n/workflow.sanitized.json",import.meta.url),"utf8"));
 assert.equal(workflow.active,false);
 for(const node of workflow.nodes) {assert.equal(node.credentials,undefined);assert.equal(node.type==="n8n-nodes-base.webhook",false);}
 const sign=workflow.nodes.find((n:{name:string})=>n.name==="Sign Exact Body");
 const http=workflow.nodes.find((n:{name:string})=>n.name==="Integration Service");
 assert.equal(sign.parameters.action,"hmac");assert.equal(sign.parameters.value,http.parameters.body);
 assert.equal(http.parameters.headerParameters.parameters[0].value,"={{ $json.signature }}");
});
