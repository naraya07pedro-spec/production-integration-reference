import assert from "node:assert/strict";
import test from "node:test";
import {createServer} from "node:http";
import {once} from "node:events";
import {FetchDownstreamClient} from "../src/http-client.js";
import {normalizeLead} from "../src/handler.js";
import {HttpError,TransientError,withRetry} from "../src/retry.js";
import {lead,immediate} from "./helpers.js";
test("real HTTP boundary forwards normalized JSON, stable key, auth and retries 429",async t=>{
 const keys:string[]=[];let calls=0;
 const server=createServer(async(req,res)=>{
   calls++; keys.push(req.headers["idempotency-key"] as string);
   assert.equal(req.headers.authorization,"Bearer local-test-only");
   const chunks=[];for await(const chunk of req)chunks.push(chunk);
   assert.equal(JSON.parse(Buffer.concat(chunks).toString()).email,"buyer@example.test");
   res.writeHead(calls===1?429:200,{"content-type":"application/json"}).end(JSON.stringify({id:"demo-remote"}));
 });
 server.listen(0,"127.0.0.1");await once(server,"listening");t.after(()=>server.close());
 const addr=server.address() as {port:number};
 const client=new FetchDownstreamClient("http://127.0.0.1:"+addr.port,"local-test-only");
 assert.deepEqual(await withRetry(()=>client.sendLead(normalizeLead(lead),"stable-key"),immediate),{externalId:"demo-remote"});
 assert.deepEqual(keys,["stable-key","stable-key"]);
});
test("transport timeout is retryable and does not become success",async t=>{
 const server=createServer((_req,res)=>{res.writeHead(200,{"content-type":"application/json"});res.flushHeaders();});
 server.listen(0,"127.0.0.1");await once(server,"listening");
 t.after(()=>{server.closeAllConnections();server.close();});
 const addr=server.address() as {port:number};
 const client=new FetchDownstreamClient("http://127.0.0.1:"+addr.port,"local-test-only",50);
 await assert.rejects(client.sendLead(normalizeLead(lead),"key"),TransientError);
});
test("HTTP errors discard sensitive response bodies",async t=>{
 const server=createServer((_req,res)=>res.writeHead(401).end("private-response"));
 server.listen(0,"127.0.0.1");await once(server,"listening");t.after(()=>server.close());
 const addr=server.address() as {port:number};
 await assert.rejects(new FetchDownstreamClient("http://127.0.0.1:"+addr.port,"local-test-only").sendLead(normalizeLead(lead),"key"),
 (e:unknown)=>e instanceof HttpError && e.status===401 && !e.message.includes("private-response"));
});
