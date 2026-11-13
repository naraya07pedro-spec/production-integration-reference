#!/usr/bin/env node
// Disposable, synthetic-only, local Docker reviewer path. Never touches existing DBs.
import {spawnSync} from "node:child_process";
import {randomUUID} from "node:crypto";
import {mkdirSync,writeFileSync} from "node:fs";
import {isLocalDockerEndpoint,parseLoopbackPublishedPort} from "./reviewer-smoke-guards.mjs";

const evidence={
 startedAt:new Date().toISOString(),sourceSha:process.env.EVIDENCE_SOURCE_SHA||process.env.GITHUB_SHA||null,
 node:process.version,platform:process.platform,checks:[],cleanup:"not-started",
 database:"generated disposable reference_test in a uniquely named loopback Docker container",
};
const name="integration-review-"+randomUUID().replaceAll("-","").slice(0,16);
function docker(args,timeout=180000,ignoreFailure=false){
 const r=spawnSync("docker",args,{encoding:"utf8",windowsHide:true,timeout,maxBuffer:1024*1024});
 if((r.error||r.status!==0)&&!ignoreFailure)
  throw new Error("Docker command failed: "+args[0]+" (exit "+r.status+")");
 return r;
}
function runNpm(args,env,limit=180000){
 // cmd.exe is required to execute npm.cmd on Windows; every argument is fixed.
 const isWindows=process.platform==="win32";
 const command=isWindows?(process.env.ComSpec||"cmd.exe"):"npm";
 const argv=isWindows?["/d","/s","/c","npm",...args]:args;
 const begin=Date.now();
 const r=spawnSync(command,argv,{env,stdio:"inherit",windowsHide:true,timeout:limit});
 const ok=!r.error&&r.status===0;
 evidence.checks.push({command:"npm "+args.join(" "),passed:ok,exitCode:r.status,elapsedMs:Date.now()-begin});
 if(!ok)throw new Error("Reviewer check failed: npm "+args.join(" "));
}
async function main(){
 if(Number(process.versions.node.split(".")[0])<24)throw new Error("Node.js 24+ required");
 if(process.env.DATABASE_URL||process.env.TEST_DATABASE_URL)
  throw new Error("Existing database environment detected; use a clean shell and disposable test database");
 const envHost=process.env.DOCKER_HOST;
 if(envHost&&!isLocalDockerEndpoint(envHost))
  throw new Error("Refusing remote Docker host configured via DOCKER_HOST");
 const info=docker(["context","inspect","--format","{{.Endpoints.docker.Host}}"],20000);
 const host=info.stdout.trim();
 if(!isLocalDockerEndpoint(host))
  throw new Error("Refusing nonlocal Docker context; select a local Docker Desktop/Engine context");
 evidence.dockerContext="local-socket-or-loopback";
 let attempted=false;
 try{
  attempted=true;
  docker(["run","--rm","--detach","--name",name,
   "--publish","127.0.0.1::5432",
   "--env","POSTGRES_USER=reference",
   "--env","POSTGRES_PASSWORD=local-demo-only",
   "--env","POSTGRES_DB=reference_test","postgres:17"],180000);
  const published=docker(["port",name,"5432/tcp"],15000);
  const port=parseLoopbackPublishedPort(published.stdout);
  let ready=false;
  for(let attempt=0;attempt<45;attempt++){
   const health=docker(["exec",name,"pg_isready","-U","reference","-d","reference_test"],10000,true);
   if(health.status===0){ready=true;break;}
   await new Promise(resolve=>setTimeout(resolve,1000));
  }
  if(!ready)throw new Error("Disposable PostgreSQL did not become ready");
  const env={...process.env,
   TEST_DATABASE_URL:"postgresql://reference:local-demo-only@127.0.0.1:"+port+"/reference_test"};
  delete env.DATABASE_URL;
  runNpm(["ci"],env,180000);
  runNpm(["run","typecheck"],env);
  runNpm(["test"],env);
  runNpm(["run","test:db"],env);
  runNpm(["run","demo"],env);
 }finally{
  if(attempted){
   const cleanup=docker(["rm","-f",name],30000,true);
   evidence.cleanup=cleanup.status===0?"container-removed":"cleanup-failed";
   if(cleanup.status!==0)process.exitCode=1;
  }
 }
}
try{
 await main();
 evidence.result=process.exitCode===1?"fail":"pass";
}catch(error){
 evidence.result="fail";
 evidence.failure=error instanceof Error?error.message:"Unknown reviewer-smoke failure";
 process.exitCode=1;
 console.error("Reviewer smoke failed: "+evidence.failure);
}finally{
 evidence.finishedAt=new Date().toISOString();
 mkdirSync("artifacts",{recursive:true});
 writeFileSync("artifacts/reviewer-smoke.json",JSON.stringify(evidence,null,2)+"\n");
 if(evidence.result==="pass")console.log("Synthetic reviewer smoke PASSED; local database container cleaned up.");
}
