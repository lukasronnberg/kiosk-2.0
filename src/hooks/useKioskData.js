import { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, addDoc, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase'; // Kontrollera att sökvägen till firebase.js stämmer

export const useKioskData = (isAuthenticated) => {
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);

  // Hämta produkter
  const fetchProducts = useCallback(async () => {
    try {
      const prodSnap = await getDocs(collection(db, "products"));
      const prodList = prodSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      prodList.sort((a, b) => a.name.localeCompare(b.name));
      setProducts(prodList);
    } catch (error) {
      console.error("Fel vid hämtning av produkter:", error);
    }
  }, []);

  // Hämta kunder
  const reloadCustomers = useCallback(async () => {
    try {
      const custSnap = await getDocs(collection(db, "customers"));
      const custList = custSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      custList.sort((a, b) => a.name.localeCompare(b.name));
      setCustomers(custList);
    } catch (error) {
      console.error("Fel vid hämtning av kunder:", error);
    }
  }, []);

  // Ladda data när man loggar in
  useEffect(() => {
    if (isAuthenticated) {
      fetchProducts();
      reloadCustomers();
    }
  }, [isAuthenticated, fetchProducts, reloadCustomers]);

  // --- ACTIONS (Spara/Ta bort) ---

  const saveProduct = async (data, id) => {
    try {
      if (id) {
        await updateDoc(doc(db, "products", id), data);
      } else {
        await addDoc(collection(db, "products"), data);
      }
      fetchProducts();
      return true;
    } catch (e) {
      console.error(e);
      alert("Kunde inte spara produkt.");
      return false;
    }
  };

  const deleteProduct = async (product) => {
    if (confirm("Radera " + product.name + "?")) {
      await deleteDoc(doc(db, "products", product.id));
      fetchProducts();
    }
  };

  const saveCustomer = async (data, id) => {
    try {
      if (id) {
        await updateDoc(doc(db, "customers", id), data);
      } else {
        await addDoc(collection(db, "customers"), data);
      }
      reloadCustomers();
      return true;
    } catch (e) {
      console.error(e);
      alert("Kunde inte spara kund.");
      return false;
    }
  };

  return {
    products,
    customers,
    fetchProducts,
    reloadCustomers,
    saveProduct,
    deleteProduct,
    saveCustomer
  };
};