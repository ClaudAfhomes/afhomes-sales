import 'dotenv/config'; import mongoose from 'mongoose'; import {schemas} from '../src/models';
export async function connect(){await mongoose.connect(process.env.MONGODB_URI||'mongodb://127.0.0.1:27017/afhomes_sales_dev');const models:Record<string,mongoose.Model<any>>={};for(const [name,schema] of Object.entries(schemas))models[name]=mongoose.models[name]||mongoose.model(name,schema);return models}
export async function close(){await mongoose.disconnect()}
