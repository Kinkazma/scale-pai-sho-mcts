import test from 'node:test';
import assert from 'node:assert/strict';
import {studyPlan} from '../scripts/study-plan.mjs';
test('4000 games balance eight budgets through 1024, durations, hemispheres and orientations',()=>{
 const plan=studyPlan();assert.equal(plan.jobs.length,4000);assert.equal(new Set(plan.jobs.map(j=>j.id)).size,4000);
 for(const budget of plan.budgets){const jobs=plan.jobs.filter(j=>j.budget===budget);assert.equal(jobs.length,500);assert.equal(jobs.filter(j=>!j.options.hemispheres).length,250);
 for(const hemisphere of ['north','south'])assert.equal(jobs.filter(j=>j.options.hemispheres&&j.options.jadeHemisphere===hemisphere).length,125);
 for(const [i,limit]of plan.limits.entries())assert.equal(jobs.filter(j=>j.limit===limit).length,100);
 }
});
