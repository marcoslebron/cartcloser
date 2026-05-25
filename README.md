# CartCloser - Shopify Abandoned Cart Recovery

Automatically recover abandoned shopping carts by sending personalized WhatsApp messages with dynamic discounts.

## Features

✅ **Abandoned Cart Detection** - Real-time webhook from Shopify
✅ **WhatsApp Integration** - Send messages directly via Twilio
✅ **Dynamic Discounts** - Customizable per merchant
✅ **Multi-tenant** - Support unlimited Shopify stores
✅ **Analytics** - Track recovery rates and revenue
✅ **Automatic Workflows** - n8n orchestration
✅ **Scalable Architecture** - NestJS + PostgreSQL

## Tech Stack

- **Backend:** NestJS, Node.js 18+
- **Database:** PostgreSQL 15
- **Automation:** n8n
- **Messaging:** Twilio WhatsApp API
- **Containerization:** Docker & Docker Compose

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Node.js 18+
- Shopify Partner Account
- Twilio Account with WhatsApp enabled

### Installation (5 minutes)

```bash
# Clone repository
git clone https://github.com/yourusername/cartcloser-saas.git
cd cartcloser-saas

# Setup environment
cp backend/.env.example backend/.env

# Edit .env with your credentials
nano backend/.env

# Start all services
docker-compose up -d

# Verify services
docker-compose ps
```

Access:
- **Backend API:** http://localhost:3000
- **n8n Dashboard:** http://localhost:5678
- **PostgreSQL:** localhost:5432

### Manual Setup (if not using Docker)

```bash
# Backend
cd backend
npm install
npm run start:dev

# In another terminal, start n8n
docker run -p 5678:5678 n8nio/n8n

# Setup PostgreSQL
# Create database 'cartcloser'
```

## Project Structure

```
cartcloser-saas/
├── backend/                 # NestJS application
│   ├── src/
│   │   ├── main.ts         # Entry point
│   │   ├── app.module.ts   # Main module
│   │   ├── carts/          # Cart logic
│   │   ├── merchants/      # Multi-tenant
│   │   ├── messages/       # Message tracking
│   │   └── analytics/      # Stats & reporting
│   ├── package.json
│   └── tsconfig.json
│
├── n8n-workflows/          # Automation workflows
│   ├── process-abandoned-cart.json
│   └── README.md
│
├── docker-compose.yml      # Local development
└── README.md
```

## API Endpoints

### Webhooks

**Shopify Abandoned Checkout:**
```
POST /webhooks/shopify/:merchantId
Content-Type: application/json

{
  "id": "checkout_123",
  "customer": { "email": "...", "phone": "..." },
  "line_items": [...],
  "total_price": "99.99"
}
```

Response:
```json
{
  "success": true,
  "cartId": "uuid-123",
  "message": "Webhook processed successfully"
}
```

### Internal API (for n8n)

**Get Merchant Config:**
```
GET /merchants/:merchantId/config
```

**Mark Message as Sent:**
```
POST /carts/:cartId/message-sent
```

**Mark Cart as Recovered:**
```
POST /carts/:cartId/recovered
```

## Database Schema

### merchants (Multi-tenant)
```sql
- id (UUID)
- shopifyStoreName (VARCHAR UNIQUE)
- shopifyAccessToken (TEXT encrypted)
- whatsappPhoneNumber (VARCHAR)
- messageTemplate (TEXT)
- defaultDiscountPercent (INT)
- isActive (BOOLEAN)
- createdAt, updatedAt
```

### carts
```sql
- id (UUID)
- merchantId (UUID FK)
- shopifyCheckoutId (VARCHAR)
- customerEmail (VARCHAR)
- customerPhone (VARCHAR)
- cartTotal (DECIMAL)
- cartItems (JSON)
- status (abandoned|contacted|recovered|expired)
- discountPercent (INT)
- messagesSent (INT)
- recoveredAt (TIMESTAMP)
- createdAt, abandonedAt
```

### messages
```sql
- id (UUID)
- merchantId (UUID FK)
- cartId (UUID FK)
- phoneNumber (VARCHAR)
- messageText (TEXT)
- status (pending|sent|delivered|read|failed)
- sentAt (TIMESTAMP)
```

## Multi-Tenant Architecture

Each Shopify store gets:
- Unique **Merchant ID** (UUID)
- Unique **API Key** for authentication
- Custom **message template**
- Custom **discount percentage**
- Custom **WhatsApp number**

Single n8n workflow handles ALL merchants by identifying `merchantId`.

## n8n Workflow

**Incoming abandoned cart:**
```
Shopify Webhook
    ↓
Get Merchant Config (from API)
    ↓
Generate Personalized Message
    ↓
Send WhatsApp (Twilio)
    ↓
Log Message Sent (back to API)
```

## Configuration

### Set Message Template

```bash
# Edit in merchant settings
messageTemplate: "Hi! You left ${cartTotal} in your cart. Complete now with ${discountPercent}% OFF 🎉"
```

Variables:
- `${cartTotal}` - Total cart amount
- `${discountPercent}` - Discount percentage
- `${link}` - Checkout link

### Customize Discount

```bash
defaultDiscountPercent: 15  # Each merchant can set their own
```

## Deployment

### Heroku

```bash
heroku create cartcloser-api
heroku addons:create heroku-postgresql:standard-0
heroku config:set N8N_WEBHOOK_BASE_URL=https://cartcloser-n8n.herokuapp.com
git push heroku main
```

### AWS / Digital Ocean

Use Docker Compose and deploy to:
- EC2 / Droplet
- ECS
- Kubernetes

### Environment Variables

See `.env.example` for all variables. Required:
```
DB_HOST, DB_USER, DB_PASSWORD, DB_NAME
JWT_SECRET
SHOPIFY_API_KEY, SHOPIFY_API_SECRET
TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN
```

## Development

### Run Tests
```bash
cd backend
npm run test
```

### Build for Production
```bash
npm run build
npm run start:prod
```

### Check Logs
```bash
docker-compose logs -f backend
docker-compose logs -f n8n
```

## Monitoring

### Database Stats
```bash
SELECT COUNT(*) FROM carts WHERE status = 'recovered';
SELECT SUM(cartTotal) FROM carts WHERE status = 'recovered';
```

### n8n Workflow Runs
Check http://localhost:5678 → Executions

### API Health
```bash
curl http://localhost:3000/health
```

## Roadmap

- [ ] Admin dashboard (React)
- [ ] SMS fallback
- [ ] Email automation
- [ ] A/B testing messages
- [ ] Advanced analytics
- [ ] Slack integration
- [ ] Custom branding
- [ ] API rate limiting

## Contributing

Pull requests welcome! Please:
1. Fork repository
2. Create feature branch
3. Commit changes
4. Push to branch
5. Create Pull Request

## License

MIT License - see LICENSE file

## Support

Issues & Questions: https://github.com/yourusername/cartcloser-saas/issues

## Author

**Marcos** - Full Stack Developer
- JavaScript/Node.js expert
- CartCloser creator
- Open source contributor

---

Built with ❤️ for e-commerce businesses
