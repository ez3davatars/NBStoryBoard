import { useState } from 'react';
import { AlertTriangle, CreditCard, KeyRound, SlidersHorizontal, X, Zap } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { SupabaseAuth } from '../../services/SupabaseClient';
import {
  getByokOwnership,
  type BillingProductKey
} from '../../utils/billingProducts';

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return String(error);
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
  const details = state.creditModal;

  if (!state.showCreditModal || !details) return null;

  const ownership = getByokOwnership({
    entitlements: state.billingEntitlements,
    hostedSession: state.hostedSession,
    apiKey: state.apiKey
  });

  const closeModal = () => dispatch({ type: 'SET_CREDIT_MODAL', payload: false });

  const launchCheckout = async (productKey: BillingProductKey) => {
    setBusyKey(productKey);
    try {
      const checkoutUrl = await SupabaseAuth.createCheckoutSession(productKey);
      window.open(checkoutUrl, '_blank', 'noopener,noreferrer');
      dispatch({ type: 'ADD_LOG', payload: { message: `Checkout launched: ${productKey}`, type: 'info' } });
      closeModal();
    } catch (error: unknown) {
      dispatch({ type: 'ADD_LOG', payload: { message: `Checkout failed: ${getErrorMessage(error)}`, type: 'error' } });
    } finally {
      setBusyKey(null);
    }
  };

  const switchToByok = () => {
    dispatch({ type: 'SET_BILLING_MODE', payload: 'byok' });
    dispatch({ type: 'ADD_LOG', payload: { message: 'Switched to BYOK Mode.', type: 'info' } });
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

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-3 backdrop-blur-xl sm:p-6">
      <div className="relative flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-yellow-400/25 bg-[#141416] shadow-[0_24px_90px_rgba(0,0,0,0.55)]">
        <button
          type="button"
          onClick={closeModal}
          className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
          title="Close"
        >
          <X className="h-4 w-4" />
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

          <section className="mt-6 rounded-lg border border-white/10 bg-black/25 p-4">
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-emerald-300">Quick fix:</h3>
            <p className="mt-2 text-sm text-gray-300">Add credits and keep generating today.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <CheckoutButton
                productKey="credit_pack_100"
                label="Add 100 Credits — $10"
                busyKey={busyKey}
                onCheckout={launchCheckout}
              />
              <CheckoutButton
                productKey="credit_pack_500"
                label="Add 500 Credits — $45"
                busyKey={busyKey}
                onCheckout={launchCheckout}
              />
            </div>
          </section>

          <section className="mt-4 rounded-lg border border-yellow-400/20 bg-yellow-400/[0.06] p-4">
            <h3 className="text-sm font-black uppercase tracking-wide text-yellow-200">Generate More for Less with BYOK Desktop</h3>
            <p className="mt-3 text-sm leading-relaxed text-gray-300">
              BYOK means Bring Your Own Key. With a BYOK Desktop license, you connect your own Google/Vertex API key and pay the AI provider directly instead of relying only on monthly Cast Director Studio credits. For high-volume creators, this may save money and gives you more control over generation costs.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {showIndieByok && (
                <CheckoutButton
                  productKey="indie_desktop_byok"
                  label="Indie Desktop BYOK — $199"
                  busyKey={busyKey}
                  onCheckout={launchCheckout}
                  variant="byok"
                />
              )}
              {showAgencyByok && (
                <CheckoutButton
                  productKey="agency_desktop_byok"
                  label="Agency Commercial BYOK — $499"
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

          <section className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] p-4">
            <p className="text-sm text-gray-300">Or lower your render quality to use fewer credits.</p>
            <button
              type="button"
              onClick={changeRenderSize}
              className="mt-3 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/10 px-4 py-3 text-xs font-black uppercase tracking-wider text-white transition-colors hover:border-white/30 hover:bg-white/15"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Change Render Size
            </button>
          </section>
        </div>
      </div>
    </div>
  );
};
