// Public, dependency-free guards for a disposable reviewer Docker session.
export function isLocalDockerEndpoint(endpoint) {
 const value=String(endpoint??"").trim();
 return /^unix:\/\/\/[^\\s]+$/.test(value)||/^npipe:\/{4}\\.\/pipe\/[A-Za-z0-9_.-]+$/.test(value)||
  /^tcp:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):[0-9]{1,5}$/.test(value);
}

export function parseLoopbackPublishedPort(output) {
 const lines=String(output??"").trim().split(/\r?\n/).filter(Boolean);
 if(lines.length!==1)throw new Error("Expected one Docker port bound to 127.0.0.1");
 const match=/^127\.0\.0\.1:([0-9]+)$/.exec(lines[0]);
 if(!match)throw new Error("Docker published port is not loopback-only");
 const port=Number(match[1]);
 if(!Number.isInteger(port)||port<1||port>65535)throw new Error("Invalid Docker published port");
 return port;
}
