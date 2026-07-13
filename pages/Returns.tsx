import { useState } from 'react';
import { motion } from 'framer-motion';
import { db, logAction, logInventoryMovement } from '@/lib/db';
import { useAuth } from '@/lib/auth';
import BarcodeReader from '@/components/BarcodeReader';
import { RotateCcw, AlertTriangle, CheckCircle, Minus, Plus } from 'lucide-react';

const RETURN_REASONS = [
  'Customer Cancelled',
  'Defective/Damaged',
  'Wrong Item Shipped',
  'Undeliverable',
];

export default function Returns() {
  const { user } = useAuth();
  const [orderId, setOrderId] = useState('');
  const [sku, setSku] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState('Customer Cancelled');
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);
  const [scanMode, setScanMode] = useState(false);

  const handleScan = (code: string) => {
    setSku(code);
    setScanMode(false);
  };

  const handleProcessReturn = async () => {
    if (!sku.trim()) {
      setMessage({ type: 'error', text: 'Please scan a returning SKU' });
      return;
    }
    if (quantity < 1) {
      setMessage({ type: 'error', text: 'Quantity must be at least 1' });
      return;
    }

    try {
      const isDefective = reason === 'Defective/Damaged';

      if (isDefective) {
        // Add to QC Hold
        await db.qcHolds.add({
          sku: sku.trim(),
          quantity,
          reason: `Return - ${reason}`,
          status: 'hold',
          operator: user?.displayName || 'Unknown',
          createdAt: new Date().toISOString(),
        });
        setMessage({ type: 'warning', text: `Logged ${quantity}x ${sku} as damaged. Item placed on QC Hold.` });
      } else {
        const existing = await db.inventory.where({ sku: sku.trim() }).first();
        if (existing && existing.id) {
          const newStock = (existing.stock || 0) + quantity;
          await db.inventory.update(existing.id, {
            stock: newStock,
            updatedAt: new Date().toISOString(),
          });
          await logInventoryMovement(sku.trim(), 'return', quantity, user?.displayName || 'Unknown', {
            toLocation: existing.location,
            note: `Return restock - ${reason}`,
          });
          setMessage({ type: 'success', text: `Restocked ${quantity} unit(s) of ${sku}` });
        } else {
          setMessage({ type: 'warning', text: `SKU ${sku} not found in inventory. Use Inbound Receiving to create it.` });
        }
      }

      // Log the return
      await db.returns.add({
        orderId: orderId || 'N/A',
        sku: sku.trim(),
        reason,
        restocked: !isDefective,
        quantity,
        processedAt: new Date().toISOString(),
      });

      // Update order status if provided
      if (orderId.trim()) {
        const order = await db.orders.where({ orderId: orderId.trim() }).first();
        if (order && order.id) {
          await db.orders.update(order.id, { status: 'Returned', updatedAt: new Date().toISOString() });
          setMessage(prev => ({
            type: prev?.type || 'success',
            text: `${prev?.text || ''} Order ${orderId} status updated to 'Returned'.`,
          }));
        }
      }

      await logAction('RETURN_PROCESSED', `Return processed: ${quantity}x ${sku} - ${reason}`, user?.displayName || 'Unknown');

      setSku('');
      setOrderId('');
      setQuantity(1);
    } catch {
      setMessage({ type: 'error', text: 'Failed to process return' });
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary">Returns Processing</h1>
        <p className="text-sm text-text-secondary mt-1">Process inbound returns and restock items</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Return Form */}
        <div className="glass-panel rounded-lg p-6">
          <div className="flex items-center gap-2 mb-6">
            <RotateCcw className="w-5 h-5 text-accent-sky" />
            <h2 className="text-sm font-semibold text-text-primary">Process Return</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-[10px] text-text-secondary uppercase tracking-widest mb-1.5">
                Original Order ID (Optional)
              </label>
              <input
                type="text"
                value={orderId}
                onChange={(e) => setOrderId(e.target.value.toUpperCase())}
                className="w-full bg-transparent border-b border-white/10 text-text-primary text-sm py-2 px-1 focus:outline-none focus:border-accent-sky transition-colors font-mono"
                placeholder="ORD-XXXX"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-[10px] text-text-secondary uppercase tracking-widest">
                  Returned SKU
                </label>
                <button
                  onClick={() => setScanMode(!scanMode)}
                  className="text-[10px] bg-accent-sky/20 text-accent-sky px-2 py-0.5 rounded-full hover:bg-accent-sky/30 transition-colors"
                >
                  {scanMode ? 'Manual Entry' : 'Scan'}
                </button>
              </div>

              {scanMode ? (
                <BarcodeReader onScan={handleScan} placeholder="Scan returned item..." />
              ) : (
                <input
                  type="text"
                  value={sku}
                  onChange={(e) => setSku(e.target.value.toUpperCase())}
                  className="w-full bg-transparent border-b border-white/10 text-text-primary text-sm py-2 px-1 focus:outline-none focus:border-accent-sky transition-colors font-mono"
                  placeholder="Enter SKU"
                />
              )}
            </div>

            <div>
              <label className="block text-[10px] text-text-secondary uppercase tracking-widest mb-1.5">
                Quantity
              </label>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="w-8 h-8 rounded-md bg-white/[0.05] flex items-center justify-center text-text-secondary hover:text-text-primary"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="text-sm font-mono text-text-primary w-8 text-center">{quantity}</span>
                <button
                  onClick={() => setQuantity(quantity + 1)}
                  className="w-8 h-8 rounded-md bg-white/[0.05] flex items-center justify-center text-text-secondary hover:text-text-primary"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[10px] text-text-secondary uppercase tracking-widest mb-1.5">
                Return Reason
              </label>
              <div className="grid grid-cols-2 gap-2">
                {RETURN_REASONS.map((r) => (
                  <button
                    key={r}
                    onClick={() => setReason(r)}
                    className={`px-3 py-2 rounded-md text-xs font-medium transition-all border ${
                      reason === r
                        ? 'bg-accent-sky/20 border-accent-sky/40 text-accent-sky'
                        : 'bg-white/[0.02] border-white/[0.06] text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {reason === 'Defective/Damaged' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="p-3 bg-accent-yellow/10 border border-accent-yellow/20 rounded-md flex items-start gap-2"
              >
                <AlertTriangle className="w-4 h-4 text-accent-yellow flex-shrink-0 mt-0.5" />
                <p className="text-xs text-accent-yellow">
                  Defective items will be placed on QC Hold and NOT restocked to active inventory.
                </p>
              </motion.div>
            )}

            {message && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`p-3 rounded-md text-xs ${
                  message.type === 'success'
                    ? 'bg-accent-green/10 border border-accent-green/20 text-accent-green'
                    : message.type === 'warning'
                      ? 'bg-accent-yellow/10 border border-accent-yellow/20 text-accent-yellow'
                      : 'bg-accent-red/10 border border-accent-red/20 text-accent-red'
                }`}
              >
                {message.text}
              </motion.div>
            )}

            <motion.button
              onClick={handleProcessReturn}
              whileTap={{ scale: 0.98 }}
              className="w-full flex items-center justify-center gap-2 py-3 bg-accent-sky text-void font-semibold text-sm rounded-md hover:bg-accent-sky/90 transition-colors active:translate-y-[1px]"
            >
              <CheckCircle className="w-4 h-4" />
              Process Return
            </motion.button>
          </div>
        </div>

        {/* Quick Guide */}
        <div className="glass-panel rounded-lg p-6">
          <h3 className="text-sm font-semibold text-text-primary mb-4">Return Workflow</h3>
          <div className="space-y-4">
            {[
              { step: '1', title: 'Receive Item', desc: 'Accept the returned package from carrier or customer' },
              { step: '2', title: 'Inspect & Scan', desc: 'Check item condition and scan the SKU barcode' },
              { step: '3', title: 'Select Reason', desc: 'Choose the appropriate return reason code' },
              { step: '4', title: 'Process', desc: 'System handles restocking based on condition' },
            ].map(item => (
              <div key={item.step} className="flex gap-3">
                <div className="w-6 h-6 rounded-full bg-accent-sky/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-[10px] font-bold text-accent-sky">{item.step}</span>
                </div>
                <div>
                  <p className="text-xs font-semibold text-text-primary">{item.title}</p>
                  <p className="text-[10px] text-text-secondary">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 pt-4 border-t border-white/[0.06]">
            <h4 className="text-[10px] text-text-secondary uppercase tracking-widest mb-2">Reason Codes</h4>
            <div className="space-y-1.5">
              {RETURN_REASONS.map(r => (
                <div key={r} className="flex items-center gap-2 text-xs">
                  <div className={`w-1.5 h-1.5 rounded-full ${r === 'Defective/Damaged' ? 'bg-accent-red' : 'bg-accent-green'}`} />
                  <span className="text-text-secondary">{r}</span>
                  {r === 'Defective/Damaged' && <span className="text-[9px] text-accent-red ml-auto">QC Hold</span>}
                  {r !== 'Defective/Damaged' && <span className="text-[9px] text-accent-green ml-auto">Restock +qty</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
