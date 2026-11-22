import { Router } from 'express';
import { z } from 'zod';
import { getPool } from '../db/index.js';
import { authenticate } from '../middleware/authenticate.js';
import { resolveSalesTenant, validateSalesTenantHeader } from '../middleware/tenant.js';

const router = Router();
const pool = getPool('laska');
const metric = z.enum(['grn','kg','pcs','tt','tt_from_x','tt_from_kg','tt_from_pcs','tt_from_sku','total_sku']);
const plan = z.object({
  id: z.uuid(), label: z.string().trim().min(1).max(160),
  metric, threshold: z.number().finite().min(0).default(0),
  brand: z.string().trim().max(160).default(''),
  displayOrder: z.number().int().min(1).max(10000),
  agentPlans: z.record(z.string().min(1).max(160), z.number().finite().min(0).max(1e12)),
});
router.use(validateSalesTenantHeader, authenticate, resolveSalesTenant(), (req,res,next)=>{
  if(req.salesTenant !== 'laska' || !['admin','manager','supervisor','agent'].includes(req.user.role)) return res.status(403).json({message:'Доступ заборонено'});
  res.set('Cache-Control','no-store');
  next();
});
router.get('/agents', async(req,res)=>{
  if(!['admin','manager'].includes(req.user.role)) return res.status(403).json({message:'Доступ заборонено'});
  const {rows}=await pool.query("SELECT DISTINCT ta AS name, COALESCE(department,'') AS department FROM public.agents WHERE nullif(trim(ta),'') IS NOT NULL ORDER BY department,name");
  res.json({rows});
});
router.get('/', async(req,res)=>{
  const {rows}=await pool.query('SELECT id,label,metric,threshold::float8,brand,display_order AS "displayOrder",agent_plans AS "agentPlans" FROM public.laska_plan_targets ORDER BY display_order,id');
  if(req.user.role === 'agent'){
    const name=req.user.representative || req.user.agent_name || '';
    return res.json({rows:rows.map(row=>({...row,agentPlans:Object.fromEntries(Object.entries(row.agentPlans).filter(([agent])=>agent.toLowerCase()===name.toLowerCase()))}))});
  }
  res.json({rows});
});
router.put('/', async(req,res)=>{
  if(!['admin','manager'].includes(req.user.role)) return res.status(403).json({message:'Редагування доступне керівнику'});
  const parsed=z.array(plan).max(100).safeParse(req.body);
  if(!parsed.success) return res.status(400).json({message:'Некоректні планові показники'});
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    await client.query('DELETE FROM public.laska_plan_targets');
    for(const row of parsed.data){
      await client.query('INSERT INTO public.laska_plan_targets(id,label,metric,threshold,brand,display_order,agent_plans) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)',[row.id,row.label,row.metric,row.threshold,row.brand,row.displayOrder,JSON.stringify(row.agentPlans)]);
    }
    await client.query('COMMIT');
    res.json({success:true});
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
});
export default router;
