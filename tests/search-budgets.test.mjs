import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,legalActions,MCTS_BUDGETS} from '../src/engine.mjs';
import {search,profileForBudget} from '../src/search.mjs';
test('1024 through 8192 use their full deterministic simulation budgets',()=>{
 for(const budget of [1024,2048,4096,8192]){
  assert.ok(MCTS_BUDGETS.includes(budget));const s=initialState(15);const a=search(s,budget,2718),b=search(s,budget,2718);
  assert.equal(a.simulations,budget);assert.equal(a.profile.id,profileForBudget(budget).id);assert.deepEqual(a.rootActions,b.rootActions);
  assert.ok(legalActions(s).some(x=>JSON.stringify(x)===JSON.stringify(a.action)));
 }
});
