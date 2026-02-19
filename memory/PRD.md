# Textzy - WhatsApp Business & SMS Platform PRD

## Project Overview
**Project Name:** Textzy  
**Type:** WhatsApp Business & SMS Platform (MSG91-like)  
**Target Market:** Indian DLT Market  
**Date Started:** Feb 19, 2024  
**Status:** MVP Frontend Complete

## Original Problem Statement
Build a complete WhatsApp Business & SMS platform similar to MSG91.com with:
- Multi-tenant architecture support
- Complete landing page
- Full dashboard UI with all modules

## User Personas
1. **Business Owner/Admin** - Full access, billing, team management
2. **Marketing Manager** - Campaign creation, templates, analytics
3. **Support Agent** - Inbox access, customer conversations
4. **Finance User** - Billing and invoices

## Core Requirements (Static)
- WhatsApp Business API integration UI
- SMS with DLT compliance (Indian market)
- Multi-tenant dashboard
- Role-based access control
- Template management with approval workflow
- Campaign & broadcast system
- Contact management with segments
- Visual automation builder
- Analytics & reporting
- Integrations (webhooks, API)
- Billing & subscription management

## What's Been Implemented ✅

### Landing Page
- Hero section with CTAs
- Features grid (6 features)
- Pricing section (3 tiers: Starter, Growth, Enterprise)
- Testimonials section
- Stats section
- Contact & footer

### Authentication Pages
- Login page with social login options
- Register page with company details, industry selection
- Forgot password flow

### Dashboard Layout
- Collapsible sidebar navigation
- Top navigation with search, notifications, user menu
- Usage stats widget in sidebar
- Responsive design

### Dashboard Modules
1. **Overview** - Stats cards, message trends chart, delivery stats, recent campaigns/conversations
2. **Inbox** - Three-pane layout, conversation list, chat area, contact details panel
3. **Contacts** - Contact table, segments sidebar, import/export, tags
4. **Campaigns** - Campaign table, status badges, create campaign dialog with scheduling
5. **Templates** - DLT Template IDs, approval status tracking, category badges
6. **Automations** - Automation list, flow builder preview, templates
7. **Analytics** - Multiple charts (area, bar, pie, line), metrics overview
8. **Integrations** - API keys, webhooks, available integrations grid
9. **Billing** - Current plan, usage progress bars, invoice history
10. **Settings** - Profile, company, notifications, security, WhatsApp tabs
11. **Team** - Team members table, roles & permissions
12. **Admin** - Tenant management, system health, activity log

## Technology Stack
- **Frontend:** React.js with React Router
- **Styling:** Tailwind CSS + Shadcn/UI components
- **Charts:** Recharts
- **Icons:** Lucide React
- **Fonts:** Manrope (headings), Inter (body)

## Prioritized Backlog

### P0 - Critical (Backend Integration)
- [ ] Real authentication with JWT
- [ ] WhatsApp Business API integration
- [ ] SMS gateway integration (DLT compliant)
- [ ] Database for contacts/campaigns
- [ ] Real-time messaging via WebSocket

### P1 - High Priority
- [ ] Template submission to WhatsApp for approval
- [ ] Bulk contact import (CSV)
- [ ] Campaign scheduling backend
- [ ] Usage tracking and limits

### P2 - Medium Priority
- [ ] Visual automation flow builder (drag-drop)
- [ ] A/B testing for campaigns
- [ ] Advanced analytics with exports
- [ ] Stripe/Razorpay payment integration

### P3 - Nice to Have
- [ ] Mobile app
- [ ] Multi-language support
- [ ] Advanced chatbot AI integration
- [ ] Custom domain for tenants

## Next Action Items
1. Implement backend authentication (JWT)
2. Connect WhatsApp Cloud API
3. Add SMS gateway with DLT registration
4. Set up MongoDB collections for contacts, campaigns, templates
5. Implement real-time inbox with WebSocket
6. Add payment gateway integration
