import { useState, useMemo } from 'react';
import './ProductGrid.css';

const ProductGrid = ({ 
  products, 
  onProductClick, 
  adminMode, 
  toggleAdmin, 
  onEditProduct,
  onDeleteProduct 
}) => {
  const [activeCategory, setActiveCategory] = useState("ALLA");

  // Räkna ut kategorier automatiskt
  const categories = useMemo(() => {
    const cats = new Set(products.map(p => p.category || "Övrigt"));
    return ["ALLA", ...Array.from(cats).sort()];
  }, [products]);

  // Filtrera produkter
  const filteredProducts = useMemo(() => {
    if (activeCategory === "ALLA") return products;
    return products.filter(p => (p.category || "Övrigt") === activeCategory);
  }, [products, activeCategory]);

  return (
    <div className="product-area">
      {/* HEADER */}
      <div className="product-header">
        <div className="logo-container">
          <img 
            src="logo.png" 
            alt="Kiosk" 
            className="app-logo" 
            onError={(e) => e.target.style.display = 'none'} 
          />
          <div className="app-title">PRÄSTBYRÅN KASSA</div>
        </div>
        <button className="admin-lock-btn" onClick={toggleAdmin}>
          {adminMode ? "🔓" : "🔒"}
        </button>
      </div>

      {/* KATEGORIER */}
      <div className="category-tabs">
        {categories.map(cat => (
          <div 
            key={cat} 
            className={`category-tab ${activeCategory === cat ? 'active' : ''}`} 
            onClick={() => setActiveCategory(cat)}
          >
            {cat}
          </div>
        ))}
      </div>

      {/* PRODUKTER */}
      <div className="product-grid-container">
        <div className="product-grid">
          {/* Knapp för att lägga till ny (bara i admin) */}
          {adminMode && (
            <div className="product-card add-product-card" onClick={() => onEditProduct(null)}>
              +
            </div>
          )}

          {filteredProducts.map(product => (
            <div 
              key={product.id} 
              className="product-card" 
              onClick={() => onProductClick(product)}
              style={{cursor: adminMode ? 'default' : 'pointer'}}
            >
              <div className="product-name">{product.name}</div>
              <div className="product-price">{product.price} kr</div>
              
              {/* Admin kontroller direkt på kortet */}
              {adminMode && (
                <div className="admin-controls">
                  <button 
                    className="btn-admin-action btn-edit" 
                    onClick={(e) => { e.stopPropagation(); onEditProduct(product); }}
                  >
                    ✏️
                  </button>
                  <button 
                    className="btn-admin-action btn-delete" 
                    onClick={(e) => { e.stopPropagation(); onDeleteProduct(product); }}
                  >
                    🗑️
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ProductGrid;