import assert from "node:assert/strict";
import { test } from "node:test";
import { makeInfraSpace, markDemoDeployed, readyMeetingSpaces, validMeetingState } from "../src/lib/meeting.ts";
import { advanceInfraApply, generateInfra, reviseInfra, startInfraApply, validInfraFlow } from "../src/lib/infraFlow.ts";
import { initialDemo, parseDemo } from "../src/lib/demo.ts";
import { generateTerraform } from "../src/lib/terraform.ts";
function emptySpace() {
  return makeInfraSpace({name:"direct",target:"AWS 샘플 대상",region:"ap-northeast-2"});
}
test("Infra answers generate directly, gated by completion/review/Apply success", () => {
  let s = emptySpace();
  assert.equal(s.status,"draft"); assert.equal(s.code,""); assert.equal(s.flow?.selected,undefined);
  assert.throws(()=>markDemoDeployed(s)); assert.throws(()=>generateInfra(s));
  s = generateInfra(reviseInfra(s,"내부 API",{region:s.region,visibility:"private",availability:"multi"},2));
  assert.match(s.code,/count = 2/); assert.doesNotMatch(s.code,/aws_internet_gateway/);
  assert.throws(()=>startInfraApply(s,false));
  s = {...s,flow:{...s.flow!,reviewed:true}};
  s = startInfraApply(s,true);
  assert.deepEqual(readyMeetingSpaces({spaces:[s],github:null}),[]);
  for(let i=0;i<3;i++) s=advanceInfraApply(s);
  assert.equal(s.flow!.apply!.status,"failed"); assert.equal(s.status,"source_generated");
  s=advanceInfraApply(startInfraApply(s,false));
  const restored=parseDemo(JSON.stringify({...initialDemo(),meeting:{spaces:[s],github:null}}));
  assert.equal(restored.meeting!.spaces[0].flow!.apply!.status,"applying");
  s=advanceInfraApply(advanceInfraApply(s));
  assert.equal(readyMeetingSpaces({spaces:[s],github:null})[0].network,"ha");
  assert.equal(validInfraFlow(s),true);
  s=reviseInfra(s,"edited",{region:s.region,visibility:"",availability:""},-1);
  assert.equal(s.code,""); assert.equal(s.flow!.apply,null); assert.equal(s.flow!.reviewed,false);
  assert.equal(s.status,"draft");
  assert.equal(validMeetingState({spaces:[s],github:null}),true);
  assert.equal(validMeetingState({spaces:[{...s,status:"demo_deployed"}],github:null}),false);
  assert.equal(validMeetingState({spaces:[{...s,flow:{...s.flow,apply:{status:"success",phase:3,fail:false}}}],github:null}),false);
});
test("legacy Infra choices migrate to their effective configuration without changing code or Apply outcome", () => {
  for(const selected of ["matched","availability","access"] as const) {
    const base=emptySpace();
    const original={region:base.region,visibility:"private",availability:"single"};
    const effective={...original,availability:selected==="availability"?"multi":"single",visibility:selected==="access"?"public":"private"};
    const code=generateTerraform(effective);
    const old={...base,status:"demo_deployed",code,flow:{...base.flow!,request:"original",step:2,choices:original,selected,reviewed:true,apply:{status:"success",phase:3,fail:false}}};
    const raw=JSON.stringify({...initialDemo(),meeting:{spaces:[old],github:null}});
    const restored=parseDemo(raw).meeting!.spaces[0];
    assert.equal(restored.code,code); assert.equal(restored.status,"demo_deployed");
    assert.deepEqual(restored.flow!.choices,effective);
    assert.deepEqual(restored.flow!.apply,old.flow.apply);
    assert.equal(restored.flow!.selected,undefined); assert.equal(restored.flow!.legacySelection,selected);
    assert.deepEqual(parseDemo(JSON.stringify({...initialDemo(),meeting:{spaces:[restored],github:null}})).meeting!.spaces[0],restored);
    assert.throws(()=>parseDemo(JSON.stringify({...initialDemo(),meeting:{spaces:[{...old,code:code+"changed"}],github:null}})),/저장/);
  }
  const draft=emptySpace();
  const restored=parseDemo(JSON.stringify({...initialDemo(),meeting:{spaces:[{...draft,flow:{...draft.flow,selected:null}}],github:null}})).meeting!.spaces[0];
  assert.equal(restored.code,""); assert.equal(restored.flow!.selected,undefined);
});
test("corrupt new-flow region rejects even before questions", () => {
  const s=emptySpace();
  assert.equal(validMeetingState({spaces:[{...s,region:"unsupported",flow:{...s.flow!,choices:{...s.flow!.choices,region:"unsupported"}}}],github:null}),false);
});
