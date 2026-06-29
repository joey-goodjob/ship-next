import { headers } from 'next/headers';
import { respData, respErr } from '@/lib/resp';
import { getAuth } from '@/core/auth';
import { createCheckout } from '@/modules/payment/service';
import { envConfigs } from '@/config';
import { getAllConfigs } from '@/modules/config/service';
import { getCheckoutPromotionCode } from '@/lib/checkout-promotion-offers';

export async function POST(req: Request) {
  try {
    const auth = getAuth();
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });

    if (!session?.user) {
      return respErr('Unauthorized');
    }

    const body = await req.json();
    const {
      product_id,
      product_name,
      plan_name,
      payment_provider,
      price,
      currency,
      type,
      description,
      plan,
      redirect,
      credits,
      credits_valid_days,
      offer,
    } = body;

    if (!product_id && !price) {
      return respErr('Missing product_id or price');
    }

    // Check for test amount in DB config (per provider)
    const configs = await getAllConfigs();
    const providerKey = payment_provider || configs.default_payment_provider;
    const testAmountRaw = providerKey ? configs[`${providerKey}_test_amount`] : undefined;
    const testAmount = testAmountRaw ? parseInt(testAmountRaw) : 0;
    const actualPrice = testAmount > 0 ? testAmount : price;

    // Build success/cancel URLs
    // successUrl goes through /api/payment/callback to query+update order status first
    const baseUrl = envConfigs.app_url || 'http://localhost:3000';
    const finalRedirect = redirect
      ? `${baseUrl}/auth-callback?redirect=${encodeURIComponent(redirect)}`
      : `${baseUrl}/settings/billing`;
    const successUrl = `${baseUrl}/api/payment/callback?redirect=${encodeURIComponent(finalRedirect)}`;
    const cancelUrl = `${baseUrl}/pricing`;
    const promotionCode = getCheckoutPromotionCode({
      offer,
      productId: product_id,
      type: type || 'one-time',
      plan,
    });

    const checkout = await createCheckout({
      userId: session.user.id,
      userEmail: session.user.email,
      productName: product_name,
      planName: plan_name,
      credits: typeof credits === 'number' ? credits : undefined,
      creditsValidDays:
        typeof credits_valid_days === 'number' ? credits_valid_days : undefined,
      paymentOrder: {
        productId: product_id,
        price: actualPrice ? { amount: actualPrice, currency: currency || 'cny' } : undefined,
        type: type || 'one-time',
        description: description || '',
        successUrl,
        cancelUrl,
        customer: {
          email: session.user.email,
          name: session.user.name,
        },
        plan: plan ? {
          name: plan.name,
          interval: plan.interval,
          intervalCount: plan.intervalCount,
        } : undefined,
        discount: promotionCode ? { code: promotionCode } : undefined,
      },
      provider: payment_provider,
    });

    return respData({ checkout_url: checkout.checkoutInfo.checkoutUrl });
  } catch (error: any) {
    console.error('checkout error:', error);
    return respErr(error.message || 'Checkout failed');
  }
}
