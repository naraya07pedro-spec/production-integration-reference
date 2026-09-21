import type { IdempotencyStore, NormalizedLead, ReservationResult, Logger } from "../src/types.js";
export class MemoryStore implements IdempotencyStore {
  states = new Map<string,string>();
  async reserve(key: string, _lead: NormalizedLead): Promise<ReservationResult> {
    const state=this.states.get(key);
    if(state) return {acquired:false,idempotencyKey:key,state};
    this.states.set(key,"RESERVED"); return {acquired:true,idempotencyKey:key};
  }
  async markSent(key:string) {this.states.set(key,"SENT");}
  async markFailed(key:string) {this.states.set(key,"FAILED");}
}
export const logger: Logger={info(){},error(){}};
export const lead={id:"demo-001",email:"Buyer@example.test",region:"id",source:"demo",message:"Synthetic test"};
export const immediate={sleep:async()=>{},random:()=>0};
