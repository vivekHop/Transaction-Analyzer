import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

export async function parseQueryWithGeminiAll(query: string, schemas: Record<string, any>) {
  const prompt = `
You are a data analysis AI. Convert the user's question into structured JSON query plans for multiple datasets.
The user question may apply to different datasets (matched-ad2, matched-ad1-idfc, unmatched, all, everest, bookings, idfc, commercials, vendors, manual-transactions) which represent different sheets/tabs in our application.
Please output a query plan for EACH dataset. If the query does not apply to a dataset or cannot be answered using its columns, output null for that dataset.

Available schemas for each dataset:
${JSON.stringify(schemas, null, 2)}

User Question: "${query}"

Return ONLY valid JSON matching this structure:
{
  "matched-ad2": { "operations": [ ... ] } or null,
  "matched-ad1-idfc": { "operations": [ ... ] } or null,
  "unmatched": { "operations": [ ... ] } or null,
  "all": { "operations": [ ... ] } or null,
  "everest": { "operations": [ ... ] } or null,
  "bookings": { "operations": [ ... ] } or null,
  "idfc": { "operations": [ ... ] } or null,
  "commercials": { "operations": [ ... ] } or null,
  "vendors": { "operations": [ ... ] } or null,
  "manual-transactions": { "operations": [ ... ] } or null
}

For each plan, operations is an array of objects matching:
{
  "type": "filter|sort|group_by|aggregate|limit",
  "field": "column_name",
  "operator": "eq|neq|gt|gte|lt|lte|contains|in|is_null|is_not_null",
  "value": "value to filter by",
  "direction": "asc|desc",
  "groupByFields": ["col1"],
  "aggregations": [{"field": "col1", "function": "sum|avg|count|min|max", "alias": "result_name"}],
  "limit": 10
}

DO NOT include markdown formatting or backticks in the response. Return raw JSON.
`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        temperature: 0,
        responseMimeType: "application/json"
      }
    });
    
    if (!response.text) throw new Error("Empty response from Gemini");
    
    const jsonStr = response.text.replace(/```json\n?|\n?```/g, '').trim();
    return JSON.parse(jsonStr);
  } catch (err: any) {
    console.error("Gemini Parsing Error:", err);
    throw new Error("Failed to parse query into operations");
  }
}
