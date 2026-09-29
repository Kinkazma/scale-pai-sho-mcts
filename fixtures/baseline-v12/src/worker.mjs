import {search} from './search.mjs';
self.onmessage=({data})=>{
  try {self.postMessage({id:data.id,result:search(data.state,data.budget,data.seed)});}
  catch(error) {self.postMessage({id:data.id,error:String(error.message||error)});}
};
