import { boolean, doublePrecision, integer, pgEnum, pgTable, serial, text, timestamp, unique } from 'drizzle-orm/pg-core'

export const listingStatusEnum = pgEnum('listing_status', ['active', 'sold', 'archived'])

export const conditionEnum = pgEnum('condition', ['new', 'like_new', 'good', 'fair'])

export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow(),
})

export const listings = pgTable('listings', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  price: integer('price').notNull(), // stored as cents; 1000 = $10.00
  zip: text('zip'),
  city: text('city'),
  state: text('state'),
  lat: doublePrecision('lat'),
  lng: doublePrecision('lng'),
  status: listingStatusEnum('status').default('active'),
  condition: conditionEnum('condition'),
  clerkUserId: text('clerk_user_id').notNull(),
  categoryId: integer('category_id').references(() => categories.id),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

export const images = pgTable('images', {
  id: serial('id').primaryKey(),
  listingId: integer('listing_id').references(() => listings.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  order: integer('order').default(0),
  createdAt: timestamp('created_at').defaultNow(),
})

// One thread per (buyer, listing) pair — enforced by unique constraint
export const threads = pgTable('threads', {
  id: serial('id').primaryKey(),
  listingId: integer('listing_id').references(() => listings.id, { onDelete: 'cascade' }).notNull(),
  buyerClerkUserId: text('buyer_clerk_user_id').notNull(),
  sellerClerkUserId: text('seller_clerk_user_id').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (t) => [unique().on(t.listingId, t.buyerClerkUserId)])

export const messages = pgTable('messages', {
  id: serial('id').primaryKey(),
  threadId: integer('thread_id').references(() => threads.id, { onDelete: 'cascade' }).notNull(),
  senderClerkUserId: text('sender_clerk_user_id').notNull(),
  body: text('body').notNull(),
  isRead: boolean('is_read').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
})

// One API key per user — cycled in place (upsert on clerkUserId)
export const apiKeys = pgTable('api_keys', {
  id: serial('id').primaryKey(),
  clerkUserId: text('clerk_user_id').notNull().unique(),
  keyHash: text('key_hash').notNull().unique(),      // SHA-256 for fast request validation
  keyEncrypted: text('key_encrypted').notNull(),     // AES-256-GCM for display
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

// One row per user — upserted on every listing post
export const userSettings = pgTable('user_settings', {
  id: serial('id').primaryKey(),
  clerkUserId: text('clerk_user_id').notNull().unique(),
  zip: text('zip'),
  notificationsEnabled: boolean('notifications_enabled').default(true).notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

export const reportReasonEnum = pgEnum('report_reason', ['spam', 'prohibited', 'misleading', 'other'])

export const reports = pgTable('reports', {
  id: serial('id').primaryKey(),
  listingId: integer('listing_id').references(() => listings.id, { onDelete: 'cascade' }).notNull(),
  reporterClerkUserId: text('reporter_clerk_user_id').notNull(),
  reason: reportReasonEnum('reason').notNull(),
  details: text('details'),
  createdAt: timestamp('created_at').defaultNow(),
}, (t) => [unique().on(t.listingId, t.reporterClerkUserId)])

export const reviews = pgTable('reviews', {
  id: serial('id').primaryKey(),
  listingId: integer('listing_id').references(() => listings.id, { onDelete: 'cascade' }).notNull(),
  reviewerClerkUserId: text('reviewer_clerk_user_id').notNull(),
  sellerClerkUserId: text('seller_clerk_user_id').notNull(),
  rating: integer('rating').notNull(),
  body: text('body'),
  createdAt: timestamp('created_at').defaultNow(),
}, (t) => [unique().on(t.listingId, t.reviewerClerkUserId)])

export const favorites = pgTable('favorites', {
  id: serial('id').primaryKey(),
  clerkUserId: text('clerk_user_id').notNull(),
  listingId: integer('listing_id').references(() => listings.id, { onDelete: 'cascade' }).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
}, (t) => [unique().on(t.clerkUserId, t.listingId)])
