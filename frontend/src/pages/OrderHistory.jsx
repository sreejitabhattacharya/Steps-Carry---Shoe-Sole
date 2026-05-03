import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useUser } from '../context/UserContext';

const API = import.meta.env.VITE_API_URL || '/api';

const OrderHistory = () => {
  const { orders: localOrders, cancelOrder } = useUser();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmCancel, setConfirmCancel] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Fetch orders from backend
  useEffect(() => {
    const fetchOrders = async () => {
      const token = localStorage.getItem('sc_token');
      // No token or admin token - show local orders only
      if (!token || token === 'admin-token') {
        setOrders(localOrders || []);
        setLoading(false);
        return;
      }
      // Check if it's a real MongoDB JWT token (not hardcoded)
      const isRealToken = token.split('.').length === 3;
      if (!isRealToken) {
        setOrders(localOrders || []);
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(`${API}/orders/my`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) {
          setOrders(localOrders || []);
          setLoading(false);
          return;
        }
        const data = await res.json();
        if (data.success && data.orders && data.orders.length > 0) {
          // Merge backend + local orders, deduplicate
          const backendIds = new Set(data.orders.map(o => o._id));
          const onlyLocal = (localOrders || []).filter(o => !o._id || !backendIds.has(o._id));
          setOrders([...data.orders, ...onlyLocal]);
        } else {
          setOrders(localOrders || []);
        }
      } catch {
        setOrders(localOrders || []);
      }
      setLoading(false);
    };
    fetchOrders();
  }, [localOrders]);

  const getStatusColor = (status) => {
    const map = {
      'Delivered':        'bg-green-100 text-green-700 border border-green-200',
      'Shipped':          'bg-blue-100 text-blue-700 border border-blue-200',
      'Out for Delivery': 'bg-orange-100 text-orange-700 border border-orange-200',
      'Placed':           'bg-yellow-100 text-yellow-700 border border-yellow-200',
      'Confirmed':        'bg-purple-100 text-purple-700 border border-purple-200',
      'Cancelled':        'bg-red-100 text-red-700 border border-red-200',
    };
    return map[status] || 'bg-gray-100 text-gray-700';
  };

  const canCancel = (order) => ['Placed', 'Confirmed'].includes(order.status);

  const handleCancel = async () => {
    if (!confirmCancel) return;
    setCancelling(true);
    const orderId = confirmCancel._id || confirmCancel.id;
    try {
      const result = await cancelOrder(orderId, 'Cancelled by customer');
      if (result?.success !== false) {
        setOrders(prev => prev.map(o =>
          (o._id === orderId || o.id === orderId) ? { ...o, status: 'Cancelled' } : o
        ));
        showToast('Order cancelled successfully!');
      } else {
        showToast(result.message || 'Failed to cancel', 'error');
      }
    } catch {
      showToast('Failed to cancel order', 'error');
    }
    setCancelling(false);
    setConfirmCancel(null);
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="animate-spin rounded-full h-10 w-10 border-4 border-[#E63946] border-t-transparent"></div>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 px-5 py-3 rounded-2xl shadow-xl text-white font-bold text-sm ${toast.type === 'error' ? 'bg-red-500' : 'bg-green-500'}`}>
          {toast.type === 'error' ? '❌' : '✅'} {toast.msg}
        </div>
      )}

      <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-6">📦 My Orders</h2>

      {orders.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-16 text-center shadow-sm">
          <p className="text-5xl mb-4">📦</p>
          <p className="text-gray-500 dark:text-gray-400 font-semibold mb-4">No orders yet!</p>
          <Link to="/shop" className="inline-block bg-[#E63946] text-white px-8 py-3 rounded-xl font-bold hover:bg-red-700 transition-colors">
            Start Shopping →
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map(order => {
            const orderId = order._id || order.id;
            const orderDate = order.createdAt || order.orderDate;
            const items = order.items || order.cart || [];
            return (
              <div key={orderId} className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">

                {/* Header */}
                <div className="bg-gray-50 dark:bg-gray-900 px-5 py-4 flex flex-wrap justify-between items-center gap-3 border-b dark:border-gray-700">
                  <div>
                    <p className="font-bold text-gray-900 dark:text-white text-sm">
                      Order #{String(orderId).slice(-6).toUpperCase()}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {orderDate ? new Date(orderDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Recently placed'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${getStatusColor(order.status)}`}>
                      {order.status}
                    </span>
                    <Link to="/account/track" className="text-[#E63946] text-xs font-bold hover:underline">
                      Track →
                    </Link>
                  </div>
                </div>

                {/* Items */}
                <div className="p-5">
                  <div className="space-y-3 mb-4">
                    {items.slice(0, 3).map((item, i) => (
                      <div key={i} className="flex items-center gap-3">
                        {item.image && (
                          <img src={item.image} alt={item.name} className="w-12 h-12 rounded-xl object-cover bg-gray-100 flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800 dark:text-white truncate">{item.name}</p>
                          <p className="text-xs text-gray-400">
                            {(item.size || item.selectedSize) ? `Size: ${item.size || item.selectedSize} · ` : ''} Qty: {item.quantity} · ₹{(item.price || item.finalPrice || 0).toLocaleString('en-IN')}
                          </p>
                        </div>
                      </div>
                    ))}
                    {items.length > 3 && (
                      <p className="text-xs text-gray-400">+{items.length - 3} more items</p>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-4 border-t dark:border-gray-700">
                    <div>
                      <p className="text-xs text-gray-400">Total Amount</p>
                      <p className="text-lg font-black text-gray-900 dark:text-white">
                        ₹{(order.totalAmount || order.total || 0).toLocaleString('en-IN')}
                      </p>
                      {order.paymentMethod?.type && (
                        <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full font-semibold ${
                          order.paymentMethod.type === 'COD'  ? 'bg-green-100 text-green-700' :
                          order.paymentMethod.type === 'UPI'  ? 'bg-purple-100 text-purple-700' :
                          order.paymentMethod.type === 'Card' ? 'bg-blue-100 text-blue-700' :
                          'bg-gray-100 text-gray-500'
                        }`}>{order.paymentMethod.type === 'COD' ? '💵 Cash on Delivery' : order.paymentMethod.type === 'UPI' ? '📱 UPI / GPay' : '💳 Card'}</span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {canCancel(order) && (
                        <button
                          onClick={() => setConfirmCancel(order)}
                          className="px-4 py-2 border-2 border-red-200 text-red-500 rounded-xl text-sm font-bold hover:bg-red-50 transition-colors"
                        >
                          Cancel Order
                        </button>
                      )}
                      {order.status === 'Delivered' && (
                        <span className="px-4 py-2 bg-green-50 text-green-600 rounded-xl text-sm font-bold">
                          ✅ Delivered
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Cancel Confirm Modal */}
      {confirmCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="text-center mb-5">
              <p className="text-4xl mb-3">⚠️</p>
              <h3 className="text-lg font-black text-gray-900 dark:text-white">Cancel Order?</h3>
              <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
                Order #{String(confirmCancel._id || confirmCancel.id).slice(-6).toUpperCase()}
              </p>
              <p className="text-gray-400 text-xs mt-2">This action cannot be undone.</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmCancel(null)}
                className="flex-1 py-3 border-2 border-gray-200 text-gray-600 rounded-xl font-bold hover:bg-gray-50 text-sm"
              >
                Keep Order
              </button>
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="flex-1 py-3 bg-red-500 text-white rounded-xl font-bold hover:bg-red-600 text-sm disabled:opacity-60"
              >
                {cancelling ? '⏳ Cancelling...' : 'Yes, Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderHistory;
