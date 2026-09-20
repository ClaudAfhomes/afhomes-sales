import {connect,close} from './db';
async function main(){const models=await connect();for(const model of Object.values(models))await model.createIndexes();console.log(`Created/verified indexes for ${Object.keys(models).length} collections.`);await close()}main().catch(e=>{console.error(e.message);process.exit(1)});
