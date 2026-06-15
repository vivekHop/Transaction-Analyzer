import { z } from 'zod';

export const QuerySchema = z.object({
  operations: z.array(z.object({
    type: z.enum(['filter', 'sort', 'group_by', 'aggregate', 'limit']),
    
    // For filter
    field: z.string().optional(),
    operator: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'in', 'is_null', 'is_not_null']).optional(),
    value: z.any().optional(),
    
    // For sort
    direction: z.enum(['asc', 'desc']).optional(),
    
    // For group_by
    groupByFields: z.array(z.string()).optional(),
    
    // For aggregate
    aggregations: z.array(z.object({
      field: z.string(),
      function: z.enum(['sum', 'avg', 'count', 'min', 'max']),
      alias: z.string()
    })).optional(),
    
    // For limit
    limit: z.number().optional()
  }))
});

export type QueryPlan = z.infer<typeof QuerySchema>;

export function executeQuery(data: any[], plan: QueryPlan): any[] {
  let result = [...data];

  for (const op of plan.operations) {
    switch (op.type) {
      case 'filter':
        if (!op.field || !op.operator) continue;
        result = result.filter(row => {
          const val = row[op.field!];
          // Null check handling
          if (op.operator === 'is_null') return val === null || val === undefined;
          if (op.operator === 'is_not_null') return val !== null && val !== undefined;
          
          if (val === null || val === undefined) return false;
          
          switch (op.operator) {
            case 'eq': return val === op.value;
            case 'neq': return val !== op.value;
            case 'gt': return Number(val) > Number(op.value);
            case 'gte': return Number(val) >= Number(op.value);
            case 'lt': return Number(val) < Number(op.value);
            case 'lte': return Number(val) <= Number(op.value);
            case 'contains': return String(val).toLowerCase().includes(String(op.value).toLowerCase());
            case 'in': return Array.isArray(op.value) && op.value.includes(val);
            default: return true;
          }
        });
        break;

      case 'sort':
        if (!op.field) continue;
        const dir = op.direction === 'desc' ? -1 : 1;
        result.sort((a, b) => {
          const valA = a[op.field!];
          const valB = b[op.field!];
          if (valA === null && valB === null) return 0;
          if (valA === null) return 1; // nulls last
          if (valB === null) return -1;
          return valA > valB ? dir : valA < valB ? -dir : 0;
        });
        break;

      case 'group_by':
        if (!op.groupByFields || op.groupByFields.length === 0) continue;
        const groups = new Map<string, any[]>();
        for (const row of result) {
          const key = op.groupByFields.map(f => row[f]).join('|||');
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push(row);
        }
        result = Array.from(groups.entries()).map(([key, rows]) => {
          const groupRow: any = {};
          op.groupByFields!.forEach((f, i) => {
            groupRow[f] = key.split('|||')[i];
          });
          groupRow._rows = rows;
          return groupRow;
        });
        break;

      case 'aggregate':
        if (!op.aggregations) continue;
        if (result.length > 0 && result[0]._rows) {
          // It's grouped
          result = result.map(group => {
            const out = { ...group };
            delete out._rows;
            for (const agg of op.aggregations!) {
              const rows = group._rows as any[];
              const vals = rows.map(r => r[agg.field]).filter(v => v !== null && v !== undefined);
              if (agg.function === 'count') {
                out[agg.alias] = vals.length;
              } else if (agg.function === 'sum') {
                out[agg.alias] = vals.reduce((sum, v) => sum + Number(v), 0);
              } else if (agg.function === 'avg') {
                out[agg.alias] = vals.length ? vals.reduce((sum, v) => sum + Number(v), 0) / vals.length : null;
              } else if (agg.function === 'max') {
                out[agg.alias] = vals.length ? Math.max(...vals.map(Number)) : null;
              } else if (agg.function === 'min') {
                out[agg.alias] = vals.length ? Math.min(...vals.map(Number)) : null;
              }
            }
            return out;
          });
        } else {
          // Aggregate entire dataset
          const out: any = {};
          for (const agg of op.aggregations!) {
            const vals = result.map(r => r[agg.field]).filter(v => v !== null && v !== undefined);
            if (agg.function === 'count') {
              out[agg.alias] = vals.length;
            } else if (agg.function === 'sum') {
              out[agg.alias] = vals.reduce((sum, v) => sum + Number(v), 0);
            } else if (agg.function === 'avg') {
              out[agg.alias] = vals.length ? vals.reduce((sum, v) => sum + Number(v), 0) / vals.length : null;
            } else if (agg.function === 'max') {
              out[agg.alias] = vals.length ? Math.max(...vals.map(Number)) : null;
            } else if (agg.function === 'min') {
              out[agg.alias] = vals.length ? Math.min(...vals.map(Number)) : null;
            }
          }
          result = [out];
        }
        break;

      case 'limit':
        if (op.limit !== undefined) {
          result = result.slice(0, op.limit);
        }
        break;
    }
  }

  return result;
}
