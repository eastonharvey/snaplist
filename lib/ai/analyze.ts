import { GoogleGenerativeAI, type Part } from '@google/generative-ai'

export interface ListingAnalysis {
  title: string
  description: string
  price: number        // cents
  categorySlug: string // matched to provided categories list
  condition: 'new' | 'like_new' | 'good' | 'fair'
}

const VALID_CONDITIONS = ['new', 'like_new', 'good', 'fair'] as const

export async function analyzeListing(
  images: { data: string; mimeType: string }[], // base64-encoded with MIME type
  location: string,    // e.g. "Austin, TX" — used for price context
  categories: string[] // slugs from DB
): Promise<ListingAnalysis> {
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!)
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash-lite',
    generationConfig: { responseMimeType: 'application/json' },
  })

  const prompt = `You are a marketplace listing assistant. Analyze the product photos and return a JSON object with exactly these fields:
- title: concise product title (e.g. "Apple MacBook Pro 13-inch M1 2021")
- description: 2-3 sentence marketplace description covering key features and visible condition
- price: suggested resale price in whole US dollars as an integer${location ? ` for the ${location} market` : ''}
- categorySlug: the best match from this list — ${categories.join(', ')}
- condition: one of new, like_new, good, fair — based on visible wear

Return only the JSON object.`

  const parts: Part[] = [
    { text: prompt },
    ...images.map(({ data, mimeType }) => ({ inlineData: { mimeType, data } })),
  ]

  const result = await model.generateContent(parts)
  const text = result.response.text()

  let data: Record<string, unknown>
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('Could not identify item from the provided photos.')
  }

  if (!data.title || !data.description || !data.price || !data.categorySlug || !data.condition) {
    throw new Error('Could not identify item from the provided photos.')
  }

  return {
    title: String(data.title),
    description: String(data.description),
    price: Math.round(Number(data.price) * 100),
    categorySlug: categories.includes(String(data.categorySlug)) ? String(data.categorySlug) : (categories[0] ?? ''),
    condition: VALID_CONDITIONS.includes(data.condition as typeof VALID_CONDITIONS[number]) ? data.condition as typeof VALID_CONDITIONS[number] : 'good',
  }
}
