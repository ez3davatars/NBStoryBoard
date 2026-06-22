import { useState } from 'react';
import { AlertTriangle, CreditCard, KeyRound, SlidersHorizontal, X, Zap } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { CheckoutSessionError, SupabaseAuth } from '../../services/SupabaseClient';
import {
  getAddOnCreditPackLabel,
  getByokOwnership,
  type BillingProductKey
} from '../../utils/billingProducts';

const CREDIT_CHECKOUT_AUTH_MESSAGE = 'Please sign in again before purchasing credits.';
const CREDIT_CHECKOUT_UNAVAILABLE_MESSAGE =
  'Credit checkout is temporarily unavailable. Please try again or contact support.';
const CHECKOUT_UNAVAILABLE_MESSAGE =
  'Checkout is temporarily unavailable. Please try again or contact support.';
const DUPLICATE_BYOK_PURCHASE_MESSAGE =
  'You already have access to this BYOK license. Switch to BYOK mode, or add credits to keep generating in Hosted mode.';

const isCreditPackCheckout = (productKey: BillingProductKey): boolean =>
  productKey.startsWith('credit_pack_');

const getCheckoutResponseField = (responseBody: unknown, key: string): string | undefined => {
  if (!responseBody || typeof responseBody !== 'object') return undefined;
  const value = (responseBody as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : undefined;
};

type CheckoutButtonProps = {
  productKey: BillingProductKey;
  label: string;
  busyKey: BillingProductKey | null;
  onCheckout: (productKey: BillingProductKey) => void;
  variant?: 'credit' | 'byok';
};

const CheckoutButton = ({ productKey, label, busyKey, onCheckout, variant = 'credit' }: CheckoutButtonProps) => {
  const isBusy = busyKey === productKey;
  const Icon = variant === 'credit' ? CreditCard : KeyRound;

  return (
    <button
      type="button"
      onClick={() => onCheckout(productKey)}
      disabled={isBusy}
      className={`group flex min-h-[48px] items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left transition-all disabled:cursor-wait disabled:opacity-70 ${
        variant === 'credit'
          ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100 hover:border-emerald-300/70 hover:bg-emerald-400/15'
          : 'border-yellow-400/30 bg-yellow-400/10 text-yellow-100 hover:border-yellow-300/70 hover:bg-yellow-400/15'
      }`}
    >
      <span className="flex min-w-0 items-center gap-3">
        <Icon className="h-4 w-4 shrink-0" />
        <span className="truncate text-xs font-black uppercase tracking-wider">{isBusy ? 'Opening checkout...' : label}</span>
      </span>
      <Zap className="h-4 w-4 shrink-0 opacity-60 transition-opacity group-hover:opacity-100" />
    </button>
  );
};

export const InsufficientCreditModal = () => {
  const { state, dispatch } = useAppContext();
  const [busyKey, setBusyKey] = useState<BillingProductKey | null>(null);
  const [manualCheckoutUrl, setManualCheckoutUrl] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const details = state.creditModal;

  if (!state.showCreditModal || !details) return null;

  const ownership = getByokOwnership({
    entitlements: state.billingEntitlements,
    hostedSession: state.hostedSession,
    apiKey: state.apiKey
  });

  const closeModal = () => {
    setManualCheckoutUrl(null);
    setCheckoutError(null);
    dispatch({ type: 'SET_CREDIT_MODAL', payload: false });
  };

  const openCheckoutUrl = async (checkoutUrl: string, reservedWindow?: Window | null): Promise<boolean> => {
    if (window.electronAPI?.openExternal) {
      await window.electronAPI.openExternal(checkoutUrl);
      return true;
    }

    if (reservedWindow && !reservedWindow.closed) {
      reservedWindow.location.href = checkoutUrl;
      reservedWindow.focus();
      return true;
    }

    const openedWindow = window.open(checkoutUrl, '_blank', 'noopener,noreferrer');
    return Boolean(openedWindow);
  };

  const launchCheckout = async (productKey: BillingProductKey) => {
    setBusyKey(productKey);
    setManualCheckoutUrl(null);
    setCheckoutError(null);
    const isCreditPack = isCreditPackCheckout(productKey);
    let accessToken: string | null = null;

    try {
      accessToken = await SupabaseAuth.getAccessToken();
    } catch (error: unknown) {
      if (isCreditPack) {
        console.error('Credit checkout auth missing', { productKey, error });
        setCheckoutError(CREDIT_CHECKOUT_AUTH_MESSAGE);
        dispatch({ type: 'ADD_LOG', payload: { message: CREDIT_CHECKOUT_AUTH_MESSAGE, type: 'error' } });
        setBusyKey(null);
        return;
      }
      console.error('Checkout auth lookup failed', { productKey, error });
    }

    if (isCreditPack && !accessToken) {
      console.error('Credit checkout auth missing', { productKey, hasAccessToken: false });
      setCheckoutError(CREDIT_CHECKOUT_AUTH_MESSAGE);
      dispatch({ type: 'ADD_LOG', payload: { message: CREDIT_CHECKOUT_AUTH_MESSAGE, type: 'error' } });
      setBusyKey(null);
      return;
    }

    const reservedCheckoutWindow = window.electronAPI?.openExternal ? null : window.open('about:blank', '_blank');

    try {
      const checkoutUrl = await SupabaseAuth.createCheckoutSession(productKey, {
        accessToken,
        requireAuth: isCreditPack
      });
      const opened = await openCheckoutUrl(checkoutUrl, reservedCheckoutWindow);
      if (!opened) {
        setManualCheckoutUrl(checkoutUrl);
        setCheckoutError('Checkout popup was blocked. Use the checkout link below.');
        dispatch({ type: 'ADD_LOG', payload: { message: 'Checkout popup was blocked. Use the checkout link in the billing modal.', type: 'error' } });
        return;
      }
      dispatch({ type: 'ADD_LOG', payload: { message: `Checkout launched: ${productKey}`, type: 'info' } });
      closeModal();
    } catch (error: unknown) {
      reservedCheckoutWindow?.close();
      const responseBody = error instanceof CheckoutSessionError ? error.responseBody : undefined;
      const checkoutErrorDetails = error instanceof CheckoutSessionError
        ? {
            productKey,
            status: error.status,
            responseBody,
            code: getCheckoutResponseField(responseBody, 'code'),
            error: getCheckoutResponseField(responseBody, 'error'),
            stripeCode: getCheckoutResponseField(responseBody, 'stripeCode'),
            stripeMessage: getCheckoutResponseField(responseBody, 'stripeMessage'),
            hasAccessToken: error.hasAccessToken
          }
        : {
            productKey,
            status: undefined,
            responseBody,
            code: undefined,
            error: error instanceof Error ? error.message : String(error),
            stripeCode: undefined,
            stripeMessage: undefined,
            hasAccessToken: Boolean(accessToken)
          };

      if (error instanceof CheckoutSessionError && error.reason === 'MISSING_URL') {
        console.error('Checkout response missing url', checkoutErrorDetails);
      } else {
        console.error('Checkout failed', checkoutErrorDetails);
      }

      if (getCheckoutResponseField(responseBody, 'code') === 'DUPLICATE_PURCHASE') {
        setCheckoutError(DUPLICATE_BYOK_PURCHASE_MESSAGE);
        return;
      }

      const isAuthFailure =
        error instanceof CheckoutSessionError &&
        (error.status === 401 || error.reason === 'AUTH_REQUIRED');
      const userMessage = isAuthFailure
        ? CREDIT_CHECKOUT_AUTH_MESSAGE
        : isCreditPack
          ? CREDIT_CHECKOUT_UNAVAILABLE_MESSAGE
          : CHECKOUT_UNAVAILABLE_MESSAGE;
      setCheckoutError(userMessage);
      dispatch({ type: 'ADD_LOG', payload: { message: userMessage, type: 'error' } });
    } finally {
      setBusyKey(null);
    }
  };

  const switchToByok = () => {
    dispatch({ type: 'SET_BILLING_MODE', payload: 'byok' });
    dispatch({ type: 'ADD_LOG', payload: { message: 'Switched to BYOK Mode.', type: 'info' } });
    if (!state.apiKey.trim()) {
      dispatch({ type: 'SET_VIEW', payload: 'settings' });
    }
    closeModal();
  };

  const changeRenderSize = () => {
    closeModal();
    dispatch({ type: 'SET_VIEW', payload: 'settings' });
    window.setTimeout(() => {
      const selector = document.getElementById('render-quality-selector');
      selector?.focus();
      selector?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 100);
  };

  const showIndieByok = !ownership.ownsIndieByok;
  const showAgencyByok = !ownership.ownsAgencyByok;
  const showSwitchToByok =
    state.billingEntitlements.effectiveBillingMode === 'hosted' &&
    ownership.canSwitchToByok;
  const shouldPrioritizeByok = showSwitchToByok && ownership.ownsAnyByok;
  const byokLicenseLabel = ownership.byokTier
    ? `${ownership.byokTier === 'agency' ? 'Agency Commercial' : 'Indie'} BYOK license`
    : 'BYOK license';

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-3 backdrop-blur-xl sm:p-6">
      <div className="relative flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-yellow-400/25 bg-[#141416] shadow-[0_24px_90px_rgba(0,0,0,0.55)]">
        <button
          type="button"
          onClick={closeModal}
          aria-label="Close insufficient credits modal"
          className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-white shadow-sm transition-colors hover:border-red-400/40 hover:bg-red-500/15 hover:text-red-200 focus:outline-none focus:ring-2 focus:ring-yellow-300/50 [&_svg]:block [&_svg]:shrink-0"
          title="Close"
        >
          <X className="h-5 w-5 text-current" strokeWidth={3} aria-hidden="true" />
        </button>

        <div className="overflow-y-auto p-5 sm:p-7">
          <div className="flex items-start gap-4 pr-10">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-yellow-400/30 bg-yellow-400/10">
              <AlertTriangle className="h-6 w-6 text-yellow-300" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-black uppercase tracking-wide text-white">Not enough Generation Credits</h2>
              <p className="mt-2 text-sm leading-relaxed text-gray-300">
                This render needs {details.requiredCredits} credits, but your account currently has {details.currentCredits}.
              </p>
            </div>
          </div>

          {shouldPrioritizeByok && (
            <section className="mt-6 rounded-lg border border-blue-400/30 bg-blue-500/10 p-4">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-blue-200">Switch to BYOK Mode</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-300">
                {byokLicenseLabel} active. Use your own Google/Vertex API key for this render and preserve Hosted credits.
              </p>
              <button
                type="button"
                onClick={switchToByok}
                className="mt-4 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-blue-400/30 bg-blue-500/10 px-4 py-3 text-xs font-black uppercase tracking-wider text-blue-100 transition-colors hover:border-blue-300/70 hover:bg-blue-500/20"
              >
                <KeyRound className="h-4 w-4" />
                Switch to BYOK Mode
              </button>
            </section>
          )}

          <section className="mt-6 rounded-lg border border-white/10 bg-black/25 p-4">
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-emerald-300">Add Credits</h3>
            <p className="mt-2 text-sm text-gray-300">Add credits and keep generating in Hosted mode.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <CheckoutButton
                productKey="credit_pack_100"
                label={getAddOnCreditPackLabel('credit_pack_100')}
                busyKey={busyKey}
                onCheckout={launchCheckout}
              />
              <CheckoutButton
                productKey="credit_pack_500"
                label={getAddOnCreditPackLabel('credit_pack_500')}
                busyKey={busyKey}
                onCheckout={launchCheckout}
              />
            </div>
            {checkoutError && (
              <div className="mt-3 rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-2 text-xs leading-relaxed text-red-100">
                {checkoutError}
              </div>
            )}
            {manualCheckoutUrl && (
              <a
                href={manualCheckoutUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 flex min-h-[42px] w-full items-center justify-center gap-2 rounded-lg border border-emerald-300/40 bg-emerald-400/15 px-4 py-3 text-xs font-black uppercase tracking-wider text-emerald-100 transition-colors hover:border-emerald-200 hover:bg-emerald-400/20"
              >
                <CreditCard className="h-4 w-4" />
                Open Checkout Page
              </a>
            )}
          </section>

          {!shouldPrioritizeByok && (
            <section className="mt-4 rounded-lg border border-yellow-400/20 bg-yellow-400/[0.06] p-4">
              <h3 className="text-sm font-black uppercase tracking-wide text-yellow-200">Generate More for Less with BYOK Desktop</h3>
              <p className="mt-3 text-sm leading-relaxed text-gray-300">
                BYOK means Bring Your Own Key. With a BYOK Desktop license, you connect your own Google/Vertex API key and pay the AI provider directly instead of relying only on monthly Cast Director Studio credits. For high-volume creators, this may save money and gives you more control over generation costs.
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {showIndieByok && (
                  <CheckoutButton
                    productKey="indie_desktop_byok"
                    label="Indie Desktop BYOK - $199"
                    busyKey={busyKey}
                    onCheckout={launchCheckout}
                    variant="byok"
                  />
                )}
                {showAgencyByok && (
                  <CheckoutButton
                    productKey="agency_desktop_byok"
                    label="Agency Commercial BYOK - $499"
                    busyKey={busyKey}
                    onCheckout={launchCheckout}
                    variant="byok"
                  />
                )}
              </div>

              {showSwitchToByok && (
                <button
                  type="button"
                  onClick={switchToByok}
                  className="mt-3 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-blue-400/30 bg-blue-500/10 px-4 py-3 text-xs font-black uppercase tracking-wider text-blue-100 transition-colors hover:border-blue-300/70 hover:bg-blue-500/20"
                >
                  <KeyRound className="h-4 w-4" />
                  Switch to BYOK Mode
                </button>
              )}
            </section>
          )}

          <section className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] p-4">
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-gray-300">Lower Render Quality</h3>
            <p className="mt-2 text-sm text-gray-300">Lower render quality to use fewer credits.</p>
            <button
              type="button"
              onClick={changeRenderSize}
              className="mt-3 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/10 px-4 py-3 text-xs font-black uppercase tracking-wider text-white transition-colors hover:border-white/30 hover:bg-white/15"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Lower Render Quality
            </button>
          </section>
        </div>
      </div>
    </div>
  );
};
