import { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, addDoc, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase'; 

export const useKioskData = (isAuthenticated) => {
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);

  // --- HÄMTA DATA ---

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

  useEffect(() => {
    if (isAuthenticated) {
      fetchProducts();
      reloadCustomers();
    }
  }, [isAuthenticated, fetchProducts, reloadCustomers]);

  // --- ACTIONS (SPARA / TA BORT) ---

  const saveProduct = async (formData, id) => {
    try {
      // 1. STÄDA DATAN (Viktigt för Firebase-reglerna!)
      // Om man valt "Ny kategori" i listan, använd det skrivna namnet istället
      const categoryToSave = (formData.category === 'NEW_CAT_OPTION') 
        ? formData.newCategory 
        : formData.category;

      const cleanedData = {
        name: formData.name,
        // Tvinga priset till en siffra. Om det misslyckas blir det 0.
        price: Number(formData.price) || 0, 
        category: categoryToSave || 'Övrigt'
      };

      // 2. SKICKA TILL FIREBASE
      if (id) {
        await updateDoc(doc(db, "products", id), cleanedData);
      } else {
        await addDoc(collection(db, "products"), cleanedData);
      }
      
      fetchProducts(); // Uppdatera listan direkt
      return true;
    } catch (e) {
      console.error("Firebase Error:", e); // Logga felet så vi ser det i konsolen
      alert("Kunde inte spara produkt. Kontrollera att priset är en siffra.");
      return false;
    }
  };

  const deleteProduct = async (product) => {
    if (confirm("Radera " + product.name + "?")) {
      try {
        await deleteDoc(doc(db, "products", product.id));
        fetchProducts();
      } catch (e) {
        console.error(e);
        alert("Kunde inte ta bort produkten.");
      }
    }
  };

  const saveCustomer = async (formData, id) => {
    try {
      // Städa kund-datan också för säkerhets skull
      const cleanedData = {
        ...formData,
        currentBalance: Number(formData.currentBalance) || 0
      };

      if (id) {
        await updateDoc(doc(db, "customers", id), cleanedData);
      } else {
        await addDoc(collection(db, "customers"), cleanedData);
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