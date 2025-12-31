import { useState } from 'react';

export const useCart = () => {
  const [cart, setCart] = useState([]);

  const addToCart = (product) => {
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        return prev.map(item => 
          item.product.id === product.id 
            ? { ...item, quantity: item.quantity + 1 } 
            : item
        );
      } else {
        return [...prev, { product, quantity: 1, cartId: Date.now() }];
      }
    });
  };

  const removeFromCart = (product) => {
    setCart(prev => {
      return prev.map(item => {
        if (item.product.id === product.id) {
          return { ...item, quantity: item.quantity - 1 };
        }
        return item;
      }).filter(item => item.quantity > 0);
    });
  };

  const clearCart = () => setCart([]);

  // Helper för att hantera actions från Sidebar
  const updateCart = (product, action) => {
    if (action === 'add') addToCart(product);
    if (action === 'decrease') removeFromCart(product);
    if (action === 'clear') clearCart();
  };

  const totalSum = cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

  return {
    cart,
    addToCart,
    removeFromCart,
    clearCart,
    updateCart,
    totalSum,
    totalItems
  };
};