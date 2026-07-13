import { useState, useCallback, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db, logAction } from '@/lib/db';
import { useAuth } from '@/lib/auth';
import {
  Truck, DollarSign, Package, Printer, Barcode, MapPin, CheckCircle,
  AlertTriangle, Scale, Ruler, Box, X, Tag, Eye,
  Weight, Info, Search, FileText, Copy, Check
} from 'lucide-react';
import type { Order, InventoryItem, CarrierRate, BoxSize, ShippingLabel } from '@/lib/db';

interface OrderLineItem {
  sku: string;
  quantity: number;
  product: string;
  weight: number;
  length: number;
  width: number;
  height: number;
}

interface TrackingResult {
  status: 'in_transit' | 'delivered' | 'out_for_delivery';
  location: string;
  updatedAt: string;
}

const mockFromAddress = {
  name: 'Vortex Warehouse',
  street: '1234 Industrial Blvd',
  city: 'San Francisco, CA 94107',
  country: 'USA',
};

const mockToAddress = {
  name: 'Customer Delivery',
  street: '5678 Market Street, Apt 42',
  city: 'New York, NY 10001',
  country: 'USA',
};

function generateBarcodeArt(code: string): string {
  const blocks = '███ █ ████ █ █  ██  ███ █ ████ █ █  ██  ███ █ ████ █ █  ██  ███ █ ████ █ █  ██  ███ █ ████ █ █  ██  ███';
  return blocks.slice(0, 60 + (code.length % 20));
}

export default function Shipping() {
  const { user } = useAuth();

  const [orders, setOrders] = useState<Order[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [carrierRates, setCarrierRates] = useState<CarrierRate[]>([]);
  const [boxSizes, setBoxSizes] = useState<BoxSize[]>([]);

  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [selectedRate, setSelectedRate] = useState<CarrierRate | null>(null);
  const [suggestedBox, setSuggestedBox] = useState<BoxSize | null>(null);
  const [generatedLabel, setGeneratedLabel] = useState<ShippingLabel | null>(null);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [trackingModal, setTrackingModal] = useState<{ order: Order; result: TrackingResult } | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'ship' | 'tracking' | 'manifest'>('ship');
  const [copiedTracking, setCopiedTracking] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const [ords, inv, rates, boxes] = await Promise.all([
      db.orders.toArray(),
      db.inventory.toArray(),
      db.carrierRates.toArray(),
      db.boxSizes.toArray(),
    ]);
    setOrders(ords);
    setInventory(inv);
    setCarrierRates(rates);
    setBoxSizes(boxes);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const readyOrders = useMemo(() => {
    return orders.filter(o => o.status === 'Packed' || o.status === 'ReadyToShip');
  }, [orders]);

  const shippedOrders = useMemo(() => {
    return orders.filter(o => o.status === 'Shipped');
  }, [orders]);

  const getOrderLineItems = useCallback((order: Order): OrderLineItem[] => {
    const skus = order.requiredSkus.split(',').map(s => s.trim()).filter(Boolean);
    const counts: Record<string, number> = {};
    for (const sku of skus) {
      counts[sku] = (counts[sku] || 0) + 1;
    }
    return Object.entries(counts).map(([sku, quantity]) => {
      const item = inventory.find(i => i.sku === sku);
      return {
        sku,
        quantity,
        product: item?.product || sku,
        weight: item?.weight || 0.1,
        length: item?.length || 10,
        width: item?.width || 5,
        height: item?.height || 2,
      };
    });
  }, [inventory]);

  const calculateOrderWeight = useCallback((order: Order): number => {
    const items = getOrderLineItems(order);
    return items.reduce((sum, item) => sum + item.weight * item.quantity, 0);
  }, [getOrderLineItems]);

  const calculateOrderDimensions = useCallback((order: Order): { length: number; width: number; height: number } => {
    const items = getOrderLineItems(order);
    if (items.length === 0) return { length: 10, width: 5, height: 2 };
    const maxLength = Math.max(...items.map(i => i.length));
    const maxWidth = Math.max(...items.map(i => i.width));
    const totalHeight = items.reduce((sum, i) => sum + i.height * i.quantity, 0);
    return { length: maxLength, width: maxWidth, height: totalHeight };
  }, [getOrderLineItems]);

  const suggestBox = useCallback((order: Order): BoxSize | null => {
    const dims = calculateOrderDimensions(order);
    const weight = calculateOrderWeight(order);
    const sorted = [...boxSizes]
      .filter(b => b.active && b.maxWeight >= weight)
      .filter(b => b.length >= dims.length && b.width >= dims.width && b.height >= dims.height)
      .sort((a, b) => (a.length * a.width * a.height) - (b.length * b.width * b.height));
    return sorted[0] || null;
  }, [boxSizes, calculateOrderDimensions, calculateOrderWeight]);

  const getMatchingRates = useCallback((order: Order): CarrierRate[] => {
    const weight = calculateOrderWeight(order);
    return carrierRates.filter(r => r.active && r.weightFrom <= weight && r.weightTo >= weight);
  }, [carrierRates, calculateOrderWeight]);

  const handleSelectOrder = (order: Order) => {
    setSelectedOrder(order);
    setSelectedRate(null);
    setGeneratedLabel(null);
    const box = suggestBox(order);
    setSuggestedBox(box);
  };

  const handleGenerateLabel = async () => {
    if (!selectedOrder || !selectedRate) {
      setMessage({ type: 'error', text: 'Select an order and a carrier rate first.' });
      return;
    }
    const weight = calculateOrderWeight(selectedOrder);
    const dims = calculateOrderDimensions(selectedOrder);
    const trackingNumber = `TRK-${selectedRate.carrier.toUpperCase()}-${Date.now()}`;
    const labelData = JSON.stringify({
      from: mockFromAddress,
      to: mockToAddress,
      carrier: selectedRate.carrier,
      service: selectedRate.service,
      trackingNumber,
      weight: `${weight.toFixed(2)} kg`,
      dimensions: `${dims.length}x${dims.width}x${dims.height} cm`,
      barcode: generateBarcodeArt(trackingNumber),
    });

    const label: ShippingLabel = {
      orderId: selectedOrder.orderId,
      carrier: selectedRate.carrier,
      service: selectedRate.service,
      trackingNumber,
      labelData,
      weight,
      dimensions: JSON.stringify(dims),
      cost: selectedRate.rate + (suggestedBox?.cost || 0),
      status: 'draft',
      createdAt: new Date().toISOString(),
    };

    const id = await db.shippingLabels.add(label);
    const saved = { ...label, id };
    setGeneratedLabel(saved);
    setMessage({ type: 'success', text: `Label generated: ${trackingNumber}` });
    if (user) {
      await logAction('LABEL_GENERATED', `Generated label ${trackingNumber} for ${selectedOrder.orderId}`, user.displayName);
    }
  };

  const handlePrintLabel = async () => {
    if (!generatedLabel) return;
    setPrintModalOpen(true);
    await db.shippingLabels.update(generatedLabel.id!, { status: 'printed', printedAt: new Date().toISOString() });
    if (user) {
      await logAction('LABEL_PRINTED', `Printed label ${generatedLabel.trackingNumber}`, user.displayName);
    }
  };

  const handleShipOrder = async () => {
    if (!selectedOrder || !selectedRate || !generatedLabel) {
      setMessage({ type: 'error', text: 'Generate label before shipping.' });
      return;
    }
    const weight = calculateOrderWeight(selectedOrder);
    const dims = calculateOrderDimensions(selectedOrder);
    await db.orders.update(selectedOrder.id!, {
      status: 'Shipped',
      carrier: selectedRate.carrier,
      service: selectedRate.service,
      trackingNumber: generatedLabel.trackingNumber,
      shippingCost: generatedLabel.cost,
      weightTotal: weight,
      dimensionsTotal: JSON.stringify(dims),
      suggestedBoxSize: suggestedBox?.name,
      actualBoxSize: suggestedBox?.name,
      updatedAt: new Date().toISOString(),
    });
    setOrders(prev =>
      prev.map(o =>
        o.id === selectedOrder.id
          ? {
              ...o,
              status: 'Shipped',
              carrier: selectedRate.carrier,
              service: selectedRate.service,
              trackingNumber: generatedLabel.trackingNumber,
              shippingCost: generatedLabel.cost,
              weightTotal: weight,
              dimensionsTotal: JSON.stringify(dims),
              suggestedBoxSize: suggestedBox?.name,
              actualBoxSize: suggestedBox?.name,
              updatedAt: new Date().toISOString(),
            }
          : o
      )
    );
    setSelectedOrder(null);
    setSelectedRate(null);
    setGeneratedLabel(null);
    setSuggestedBox(null);
    setMessage({ type: 'success', text: `Order ${selectedOrder.orderId} shipped!` });
    if (user) {
      await logAction('ORDER_SHIPPED', `Shipped ${selectedOrder.orderId} via ${selectedRate.carrier} ${selectedRate.service}`, user.displayName);
    }
  };

  const handleTrack = (order: Order) => {
    const statuses: TrackingResult['status'][] = ['in_transit', 'delivered', 'out_for_delivery'];
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const locations = ['Distribution Center NY', 'Regional Hub Chicago', 'Local Facility LA', 'Delivery Station SF'];
    const result: TrackingResult = {
      status,
      location: locations[Math.floor(Math.random() * locations.length)],
      updatedAt: new Date().toISOString(),
    };
    setTrackingModal({ order, result });
  };

  const copyTracking = (trackingNumber: string) => {
    navigator.clipboard.writeText(trackingNumber);
    setCopiedTracking(trackingNumber);
    setTimeout(() => setCopiedTracking(null), 2000);
  };

  // ─── Stats ────────────────────────────────────────────────────────────
  const todayISO = new Date().toISOString().split('T')[0];
  const shippedToday = shippedOrders.filter(o => o.updatedAt?.startsWith(todayISO)).length;
  const pendingShipments = readyOrders.length;
  const avgShippingCost = useMemo(() => {
    const costs = shippedOrders.map(o => o.shippingCost).filter(Boolean) as number[];
    if (costs.length === 0) return 0;
    return costs.reduce((a, b) => a + b, 0) / costs.length;
  }, [shippedOrders]);
  const totalWeightShipped = useMemo(() => {
    return shippedOrders.reduce((sum, o) => sum + (o.weightTotal || 0), 0);
  }, [shippedOrders]);

  const manifestByCarrier = useMemo(() => {
    const map = new Map<string, { orders: Order[]; totalWeight: number; totalCost: number }>();
    for (const o of shippedOrders) {
      const carrier = o.carrier || 'Unknown';
      if (!map.has(carrier)) map.set(carrier, { orders: [], totalWeight: 0, totalCost: 0 });
      const entry = map.get(carrier)!;
      entry.orders.push(o);
      entry.totalWeight += o.weightTotal || 0;
      entry.totalCost += o.shippingCost || 0;
    }
    return Array.from(map.entries()).sort((a, b) => b[1].orders.length - a[1].orders.length);
  }, [shippedOrders]);

  const containerVariants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.05 } },
  };
  const itemVariants = {
    hidden: { opacity: 0, y: 12 },
    show: { opacity: 1, y: 0 },
  };

  return (
    <div className="min-h-screen bg-void text-text-primary p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-accent-sky/10 text-accent-sky">
              <Truck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-text-primary">Shipping</h1>
              <p className="text-xs text-text-secondary">Fulfillment & carrier management</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('ship')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeTab === 'ship' ? 'bg-accent-sky text-void' : 'bg-white/[0.03] text-text-secondary hover:text-text-primary'
              }`}
            >
              Ship Orders
            </button>
            <button
              onClick={() => setActiveTab('tracking')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeTab === 'tracking' ? 'bg-accent-sky text-void' : 'bg-white/[0.03] text-text-secondary hover:text-text-primary'
              }`}
            >
              Tracking
            </button>
            <button
              onClick={() => setActiveTab('manifest')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeTab === 'manifest' ? 'bg-accent-sky text-void' : 'bg-white/[0.03] text-text-secondary hover:text-text-primary'
              }`}
            >
              Manifest
            </button>
          </div>
        </motion.div>

        {/* Stats */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="grid grid-cols-2 lg:grid-cols-4 gap-3"
        >
          {[
            { label: 'Shipped Today', value: shippedToday, icon: CheckCircle, color: 'text-accent-green' },
            { label: 'Pending Shipments', value: pendingShipments, icon: Package, color: 'text-accent-yellow' },
            { label: 'Avg Shipping Cost', value: `$${avgShippingCost.toFixed(2)}`, icon: DollarSign, color: 'text-accent-sky' },
            { label: 'Total Weight Shipped', value: `${totalWeightShipped.toFixed(2)} kg`, icon: Scale, color: 'text-text-secondary' },
          ].map((stat, i) => (
            <motion.div
              key={i}
              variants={itemVariants}
              className="glass-panel rounded-lg p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-text-secondary">{stat.label}</span>
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
              </div>
              <div className="text-lg font-bold">{stat.value}</div>
            </motion.div>
          ))}
          {/* Cost Breakdown by Carrier */}
          <motion.div
            variants={itemVariants}
            className="glass-panel rounded-lg p-4 col-span-2 lg:col-span-4"
          >
            <div className="flex items-center gap-2 mb-3">
              <DollarSign className="w-4 h-4 text-accent-sky" />
              <span className="text-xs font-semibold">Cost Breakdown by Carrier</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {manifestByCarrier.map(([carrier, data]) => (
                <div key={carrier} className="bg-white/[0.02] rounded-md p-3">
                  <div className="text-[10px] text-text-secondary mb-1">{carrier}</div>
                  <div className="text-sm font-bold text-accent-sky">${data.totalCost.toFixed(2)}</div>
                  <div className="text-[10px] text-text-secondary">{data.orders.length} orders · {data.totalWeight.toFixed(2)} kg</div>
                </div>
              ))}
              {manifestByCarrier.length === 0 && (
                <div className="text-xs text-text-secondary col-span-full">No shipped orders yet</div>
              )}
            </div>
          </motion.div>
        </motion.div>

        {/* Alerts */}
        <AnimatePresence>
          {message && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className={`rounded-lg p-3 text-xs flex items-center gap-2 ${
                message.type === 'success'
                  ? 'bg-accent-green/10 text-accent-green border border-accent-green/20'
                  : message.type === 'error'
                  ? 'bg-accent-red/10 text-accent-red border border-accent-red/20'
                  : 'bg-white/[0.03] text-text-secondary border border-white/[0.08]'
              }`}
            >
              {message.type === 'success' ? <CheckCircle className="w-4 h-4" /> : message.type === 'error' ? <AlertTriangle className="w-4 h-4" /> : <Info className="w-4 h-4" />}
              {message.text}
              <button onClick={() => setMessage(null)} className="ml-auto hover:text-text-primary">
                <X className="w-3 h-3" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {activeTab === 'ship' ? (
            <motion.div
              key="ship"
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 12 }}
              className="grid grid-cols-1 lg:grid-cols-3 gap-4"
            >
              {/* Left: Ready Orders */}
              <div className="lg:col-span-1 space-y-4">
                <div className="glass-panel rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Package className="w-4 h-4 text-accent-sky" />
                    <h2 className="text-sm font-semibold">Ready to Ship</h2>
                    <span className="ml-auto text-xs text-text-secondary">{readyOrders.length}</span>
                  </div>
                  <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                    {readyOrders.length === 0 && (
                      <div className="text-xs text-text-secondary py-6 text-center">No orders ready for shipping</div>
                    )}
                    {readyOrders.map(order => (
                      <motion.button
                        key={order.id}
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                        onClick={() => handleSelectOrder(order)}
                        className={`w-full text-left rounded-lg p-3 border transition-colors ${
                          selectedOrder?.id === order.id
                            ? 'border-accent-sky/40 bg-accent-sky/5'
                            : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold">{order.orderId}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                            order.priority === 'urgent' ? 'bg-accent-red/10 text-accent-red' :
                            order.priority === 'high' ? 'bg-accent-yellow/10 text-accent-yellow' :
                            'bg-white/[0.05] text-text-secondary'
                          }`}>
                            {order.priority}
                          </span>
                        </div>
                        <div className="text-[10px] text-text-secondary truncate">{order.requiredSkus}</div>
                        <div className="flex items-center gap-3 mt-2 text-[10px] text-text-secondary">
                          <span className="flex items-center gap-1"><Weight className="w-3 h-3" /> {calculateOrderWeight(order).toFixed(2)} kg</span>
                          <span className="flex items-center gap-1"><Ruler className="w-3 h-3" /> {order.dimensionsTotal || '—'}</span>
                        </div>
                      </motion.button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right: Shipping Workflow */}
              <div className="lg:col-span-2 space-y-4">
                {!selectedOrder ? (
                  <div className="glass-panel rounded-lg p-8 text-center text-text-secondary">
                    <Truck className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">Select an order to start shipping</p>
                  </div>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-4"
                  >
                    {/* Order Detail */}
                    <div className="glass-panel rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-accent-sky" />
                          <h2 className="text-sm font-semibold">Order {selectedOrder.orderId}</h2>
                        </div>
                        <button
                          onClick={() => { setSelectedOrder(null); setSelectedRate(null); setGeneratedLabel(null); setSuggestedBox(null); }}
                          className="text-text-secondary hover:text-text-primary"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                        <div className="bg-white/[0.02] rounded-md p-2.5">
                          <div className="text-text-secondary text-[10px] mb-1">Weight</div>
                          <div className="font-semibold">{calculateOrderWeight(selectedOrder).toFixed(2)} kg</div>
                        </div>
                        <div className="bg-white/[0.02] rounded-md p-2.5">
                          <div className="text-text-secondary text-[10px] mb-1">Dimensions</div>
                          <div className="font-semibold">
                            {(() => { const d = calculateOrderDimensions(selectedOrder); return `${d.length}x${d.width}x${d.height}`; })()} cm
                          </div>
                        </div>
                        <div className="bg-white/[0.02] rounded-md p-2.5">
                          <div className="text-text-secondary text-[10px] mb-1">Items</div>
                          <div className="font-semibold">{getOrderLineItems(selectedOrder).length} SKUs</div>
                        </div>
                      </div>
                      <div className="mt-3 space-y-1">
                        {getOrderLineItems(selectedOrder).map(item => (
                          <div key={item.sku} className="flex items-center justify-between text-xs bg-white/[0.02] rounded-md px-2.5 py-1.5">
                            <span className="text-text-secondary">{item.sku}</span>
                            <span className="text-text-primary">{item.product}</span>
                            <span className="text-text-secondary">x{item.quantity}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Box Suggestion */}
                    <div className="glass-panel rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Box className="w-4 h-4 text-accent-green" />
                        <h2 className="text-sm font-semibold">Box Suggestion</h2>
                      </div>
                      {suggestedBox ? (
                        <div className="flex items-center gap-3 bg-white/[0.02] rounded-lg p-3">
                          <div className="p-2 rounded-md bg-accent-green/10 text-accent-green">
                            <Box className="w-5 h-5" />
                          </div>
                          <div className="flex-1">
                            <div className="text-sm font-semibold">{suggestedBox.name}</div>
                            <div className="text-[10px] text-text-secondary">
                              {suggestedBox.length}x{suggestedBox.width}x{suggestedBox.height} cm · Max {suggestedBox.maxWeight} kg · {suggestedBox.material}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-bold text-accent-sky">${suggestedBox.cost.toFixed(2)}</div>
                            <div className="text-[10px] text-text-secondary">box cost</div>
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-text-secondary py-2">No suitable box found. Check item dimensions.</div>
                      )}
                    </div>

                    {/* Rate Shopping */}
                    <div className="glass-panel rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <DollarSign className="w-4 h-4 text-accent-yellow" />
                        <h2 className="text-sm font-semibold">Rate Shopping</h2>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-text-secondary border-b border-white/[0.06]">
                              <th className="text-left py-2 px-2 font-medium">Carrier</th>
                              <th className="text-left py-2 px-2 font-medium">Service</th>
                              <th className="text-right py-2 px-2 font-medium">Rate</th>
                              <th className="text-right py-2 px-2 font-medium">Est. Days</th>
                              <th className="text-right py-2 px-2 font-medium">Total</th>
                              <th className="py-2 px-2"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {getMatchingRates(selectedOrder).length === 0 && (
                              <tr>
                                <td colSpan={6} className="py-4 text-center text-text-secondary">No matching carrier rates found</td>
                              </tr>
                            )}
                            {getMatchingRates(selectedOrder).map(rate => {
                              const total = rate.rate + (suggestedBox?.cost || 0);
                              const isSelected = selectedRate?.id === rate.id;
                              return (
                                <tr
                                  key={rate.id}
                                  className={`border-b border-white/[0.04] transition-colors ${isSelected ? 'bg-accent-sky/5' : 'hover:bg-white/[0.02]'}`}
                                >
                                  <td className="py-2.5 px-2 font-medium">{rate.carrier}</td>
                                  <td className="py-2.5 px-2 text-text-secondary">{rate.service}</td>
                                  <td className="py-2.5 px-2 text-right">${rate.rate.toFixed(2)}</td>
                                  <td className="py-2.5 px-2 text-right">{rate.estimatedDays}d</td>
                                  <td className="py-2.5 px-2 text-right font-bold text-accent-sky">${total.toFixed(2)}</td>
                                  <td className="py-2.5 px-2 text-right">
                                    <button
                                      onClick={() => setSelectedRate(rate)}
                                      className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors ${
                                        isSelected ? 'bg-accent-sky text-void' : 'bg-white/[0.05] text-text-secondary hover:text-text-primary'
                                      }`}
                                    >
                                      {isSelected ? 'Selected' : 'Select'}
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={handleGenerateLabel}
                        disabled={!selectedRate}
                        className="flex items-center gap-2 px-4 py-2 rounded-md text-xs font-medium bg-white/[0.05] text-text-primary border border-white/[0.08] hover:bg-white/[0.08] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <Barcode className="w-4 h-4" /> Generate Label
                      </button>
                      <button
                        onClick={handlePrintLabel}
                        disabled={!generatedLabel}
                        className="flex items-center gap-2 px-4 py-2 rounded-md text-xs font-medium bg-white/[0.05] text-text-primary border border-white/[0.08] hover:bg-white/[0.08] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <Printer className="w-4 h-4" /> Print Label
                      </button>
                      <button
                        onClick={handleShipOrder}
                        disabled={!generatedLabel}
                        className="flex items-center gap-2 px-4 py-2 rounded-md text-xs font-medium bg-accent-sky text-void hover:bg-accent-sky/90 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <Truck className="w-4 h-4" /> Confirm Shipment
                      </button>
                    </div>

                    {/* Generated Label Preview */}
                    <AnimatePresence>
                      {generatedLabel && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="glass-panel rounded-lg p-4 overflow-hidden"
                        >
                          <div className="flex items-center gap-2 mb-3">
                            <Tag className="w-4 h-4 text-accent-green" />
                            <h2 className="text-sm font-semibold">Label Preview</h2>
                          </div>
                          <div className="bg-white rounded-md p-4 text-void text-xs font-mono space-y-2">
                            <div className="flex justify-between items-start border-b border-gray-200 pb-2">
                              <div>
                                <div className="font-bold text-sm">{JSON.parse(generatedLabel.labelData).carrier} {JSON.parse(generatedLabel.labelData).service}</div>
                                <div className="text-gray-600">{generatedLabel.trackingNumber}</div>
                              </div>
                              <div className="text-right">
                                <div className="font-bold">{generatedLabel.weight.toFixed(2)} kg</div>
                                <div className="text-gray-600">{JSON.parse(generatedLabel.labelData).dimensions}</div>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 py-2">
                              <div>
                                <div className="text-gray-500 text-[10px] uppercase">From</div>
                                <div className="font-semibold">{mockFromAddress.name}</div>
                                <div>{mockFromAddress.street}</div>
                                <div>{mockFromAddress.city}</div>
                              </div>
                              <div>
                                <div className="text-gray-500 text-[10px] uppercase">To</div>
                                <div className="font-semibold">{mockToAddress.name}</div>
                                <div>{mockToAddress.street}</div>
                                <div>{mockToAddress.city}</div>
                              </div>
                            </div>
                            <div className="text-center py-2">
                              <div className="text-[10px] text-gray-500 uppercase tracking-widest">Tracking Barcode</div>
                              <div className="text-lg tracking-wider leading-tight select-none">{generateBarcodeArt(generatedLabel.trackingNumber)}</div>
                              <div className="text-[10px] text-gray-600 mt-1">{generatedLabel.trackingNumber}</div>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )}
              </div>
            </motion.div>
          ) : activeTab === 'tracking' ? (
            <motion.div
              key="tracking"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              className="space-y-4"
            >
              <div className="glass-panel rounded-lg p-4">
                <div className="flex items-center gap-2 mb-4">
                  <MapPin className="w-4 h-4 text-accent-sky" />
                  <h2 className="text-sm font-semibold">Tracking Dashboard</h2>
                  <span className="ml-auto text-xs text-text-secondary">{shippedOrders.length} shipped</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-text-secondary border-b border-white/[0.06]">
                        <th className="text-left py-2 px-2 font-medium">Order</th>
                        <th className="text-left py-2 px-2 font-medium">Carrier</th>
                        <th className="text-left py-2 px-2 font-medium">Service</th>
                        <th className="text-left py-2 px-2 font-medium">Tracking #</th>
                        <th className="text-right py-2 px-2 font-medium">Cost</th>
                        <th className="text-right py-2 px-2 font-medium">Weight</th>
                        <th className="py-2 px-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {shippedOrders.length === 0 && (
                        <tr>
                          <td colSpan={7} className="py-6 text-center text-text-secondary">No shipped orders yet</td>
                        </tr>
                      )}
                      {shippedOrders.map(order => (
                        <tr key={order.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                          <td className="py-2.5 px-2 font-medium">{order.orderId}</td>
                          <td className="py-2.5 px-2 text-text-secondary">{order.carrier || '—'}</td>
                          <td className="py-2.5 px-2 text-text-secondary">{order.service || '—'}</td>
                          <td className="py-2.5 px-2">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[10px]">{order.trackingNumber || '—'}</span>
                              {order.trackingNumber && (
                                <button
                                  onClick={() => copyTracking(order.trackingNumber!)}
                                  className="text-text-secondary hover:text-accent-sky transition-colors"
                                  title="Copy tracking number"
                                >
                                  {copiedTracking === order.trackingNumber ? <Check className="w-3 h-3 text-accent-green" /> : <Copy className="w-3 h-3" />}
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-2 text-right">${order.shippingCost?.toFixed(2) || '—'}</td>
                          <td className="py-2.5 px-2 text-right">{order.weightTotal ? `${order.weightTotal.toFixed(2)} kg` : '—'}</td>
                          <td className="py-2.5 px-2 text-right">
                            <button
                              onClick={() => handleTrack(order)}
                              disabled={!order.trackingNumber}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-medium bg-white/[0.05] text-text-secondary hover:text-text-primary hover:bg-white/[0.08] disabled:opacity-30 disabled:cursor-not-allowed transition-colors ml-auto"
                            >
                              <Eye className="w-3 h-3" /> Track
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="manifest"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              className="space-y-4"
            >
              <div className="glass-panel rounded-lg p-4">
                <div className="flex items-center gap-2 mb-4">
                  <FileText className="w-4 h-4 text-accent-sky" />
                  <h2 className="text-sm font-semibold">Daily Shipping Manifest</h2>
                  <span className="ml-auto text-xs text-text-secondary">{shippedOrders.length} orders</span>
                </div>
                <div className="space-y-4">
                  {manifestByCarrier.map(([carrier, data]) => (
                    <div key={carrier} className="border border-white/[0.06] rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Truck className="w-4 h-4 text-text-secondary" />
                          <span className="text-sm font-bold">{carrier}</span>
                        </div>
                        <div className="text-xs text-text-secondary">{data.orders.length} orders · ${data.totalCost.toFixed(2)} · {data.totalWeight.toFixed(2)} kg</div>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-text-secondary border-b border-white/[0.06]">
                              <th className="text-left py-1.5 px-2 font-medium">Order</th>
                              <th className="text-left py-1.5 px-2 font-medium">Tracking #</th>
                              <th className="text-right py-1.5 px-2 font-medium">Cost</th>
                              <th className="text-right py-1.5 px-2 font-medium">Weight</th>
                            </tr>
                          </thead>
                          <tbody>
                            {data.orders.map(o => (
                              <tr key={o.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                                <td className="py-1.5 px-2 font-medium">{o.orderId}</td>
                                <td className="py-1.5 px-2 font-mono text-[10px]">{o.trackingNumber || '—'}</td>
                                <td className="py-1.5 px-2 text-right">${o.shippingCost?.toFixed(2) || '—'}</td>
                                <td className="py-1.5 px-2 text-right">{o.weightTotal ? `${o.weightTotal.toFixed(2)} kg` : '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                  {manifestByCarrier.length === 0 && (
                    <div className="text-center py-12 text-text-secondary text-xs">No shipped orders to manifest</div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Print Label Modal */}
      <AnimatePresence>
        {printModalOpen && generatedLabel && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-lg shadow-2xl max-w-md w-full overflow-hidden"
            >
              <div className="flex items-center justify-between p-4 border-b border-gray-100">
                <div className="flex items-center gap-2 text-void">
                  <Printer className="w-4 h-4" />
                  <span className="text-sm font-semibold">Print Label</span>
                </div>
                <button onClick={() => setPrintModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-6">
                <div className="bg-white border border-gray-200 rounded-md p-4 text-void text-xs font-mono space-y-3 mb-4">
                  <div className="flex justify-between items-start border-b border-gray-200 pb-2">
                    <div>
                      <div className="font-bold text-sm">{generatedLabel.carrier} {generatedLabel.service}</div>
                      <div className="text-gray-600">{generatedLabel.trackingNumber}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold">{generatedLabel.weight.toFixed(2)} kg</div>
                      <div className="text-gray-600">{JSON.parse(generatedLabel.labelData).dimensions}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 py-1">
                    <div>
                      <div className="text-gray-500 text-[10px] uppercase">From</div>
                      <div className="font-semibold">{mockFromAddress.name}</div>
                      <div>{mockFromAddress.street}</div>
                      <div>{mockFromAddress.city}</div>
                    </div>
                    <div>
                      <div className="text-gray-500 text-[10px] uppercase">To</div>
                      <div className="font-semibold">{mockToAddress.name}</div>
                      <div>{mockToAddress.street}</div>
                      <div>{mockToAddress.city}</div>
                    </div>
                  </div>
                  <div className="text-center py-2">
                    <div className="text-[10px] text-gray-500 uppercase tracking-widest">Tracking Barcode</div>
                    <div className="text-base tracking-wider leading-tight select-none">{generateBarcodeArt(generatedLabel.trackingNumber)}</div>
                    <div className="text-[10px] text-gray-600 mt-1">{generatedLabel.trackingNumber}</div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      window.print();
                      setMessage({ type: 'success', text: 'Print job sent to printer.' });
                      setPrintModalOpen(false);
                    }}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-xs font-medium bg-accent-sky text-void hover:bg-accent-sky/90 transition-colors"
                  >
                    <Printer className="w-4 h-4" /> Print Now
                  </button>
                  <button
                    onClick={() => setPrintModalOpen(false)}
                    className="px-4 py-2 rounded-md text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tracking Result Modal */}
      <AnimatePresence>
        {trackingModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="glass-panel rounded-lg shadow-2xl max-w-sm w-full"
            >
              <div className="flex items-center justify-between p-4 border-b border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <Search className="w-4 h-4 text-accent-sky" />
                  <span className="text-sm font-semibold">Tracking Result</span>
                </div>
                <button onClick={() => setTrackingModal(null)} className="text-text-secondary hover:text-text-primary">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div className="text-center">
                  <div className="text-xs text-text-secondary mb-1">Order {trackingModal.order.orderId}</div>
                  <div className="font-mono text-xs text-text-primary">{trackingModal.order.trackingNumber}</div>
                </div>
                <div className="bg-white/[0.02] rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-text-secondary">Status</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      trackingModal.result.status === 'delivered' ? 'bg-accent-green/10 text-accent-green' :
                      trackingModal.result.status === 'out_for_delivery' ? 'bg-accent-yellow/10 text-accent-yellow' :
                      'bg-white/[0.05] text-text-primary'
                    }`}>
                      {trackingModal.result.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-text-secondary">Location</span>
                    <span className="text-xs text-text-primary">{trackingModal.result.location}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-text-secondary">Updated</span>
                    <span className="text-xs text-text-primary">{new Date(trackingModal.result.updatedAt).toLocaleString()}</span>
                  </div>
                </div>
                <button
                  onClick={() => setTrackingModal(null)}
                  className="w-full px-4 py-2 rounded-md text-xs font-medium bg-accent-sky text-void hover:bg-accent-sky/90 transition-colors"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
