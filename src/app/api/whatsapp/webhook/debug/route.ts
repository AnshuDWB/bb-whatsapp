import { NextResponse } from 'next/server'
import { parseAppSecrets } from '@/lib/whatsapp/webhook-signature'

/**
 * GET /api/whatsapp/webhook/debug
 *
 * Diagnostic endpoint – shows whether the critical env vars for
 * inbound webhook processing are present and well-formed.
 *
 * ⚠️  Never exposes actual secret values – only presence / length.
 * Safe to hit from a browser during setup; remove or gate behind
 * auth before going to production with real traffic.
 */
export async function GET() {
  const verifyToken = process.env.WEBHOOK_VERIFY_TOKEN
  const appSecretRaw = process.env.META_APP_SECRET
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  const appSecrets = parseAppSecrets(appSecretRaw)

  const checks = {
    timestamp: new Date().toISOString(),
    webhook_url: '/api/whatsapp/webhook',
    environment: {
      WEBHOOK_VERIFY_TOKEN: verifyToken
        ? `✅ Set (${verifyToken.length} chars)`
        : '❌ MISSING — Meta verification will fail',
      META_APP_SECRET: appSecrets.length > 0
        ? `✅ Set (${appSecrets.length} secret(s), first ${appSecrets[0].length} chars)`
        : '❌ MISSING — ALL inbound POSTs will be rejected with 401',
      NEXT_PUBLIC_SUPABASE_URL: supabaseUrl
        ? `✅ Set`
        : '❌ MISSING — DB lookups will crash',
      SUPABASE_SERVICE_ROLE_KEY: serviceKey
        ? `✅ Set (${serviceKey.length} chars)`
        : '❌ MISSING — DB lookups will crash',
    },
    meta_dashboard_checklist: [
      '1. Go to Meta Developer Dashboard → Your App → WhatsApp → Configuration',
      '2. Callback URL must be: https://<your-domain>/api/whatsapp/webhook',
      '3. Verify Token must match your WEBHOOK_VERIFY_TOKEN exactly',
      '4. Click "Verify and Save" — must return 200',
      '5. Under "Webhook Fields", subscribe to: messages (CRITICAL!)',
      '6. Also subscribe to: message_template_status_update (for template status)',
      '7. App Secret (App Settings → Basic) must match META_APP_SECRET',
    ],
    common_issues: [
      '❗ "messages" field not subscribed — #1 reason for no inbound',
      '❗ META_APP_SECRET wrong — webhook POST returns 401 (check server logs)',
      '❗ Render/Vercel deployment not updated — old code still running',
      '❗ WhatsApp phone number not linked to the app in Meta dashboard',
      '❗ Test message sent from same number as business — WhatsApp blocks self-messages',
    ],
  }

  return NextResponse.json(checks, { status: 200 })
}
