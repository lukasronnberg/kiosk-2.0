import { useMemo } from 'react';
import './EconomyView.css';

const TEST_EMAIL_OVERRIDE = import.meta.env.VITE_TEST_EMAIL_OVERRIDE || "lukas.e.e.ronnberg@gmail.com";
// Vi behöver datumet här också för att räkna ut maxgränsen
const CAMP_START_DATE = new Date(import.meta.env.VITE_CAMP_START_DATE || "2025-12-30");

const EconomyView = ({ 
  customers, 
  onEmailAll, 
  onOpenPayment, 
  onUndoPayment, 
  isProcessing 
}) => {

  // --- 1. HJÄLPFUNKTION FÖR VECKA ---
  const getCurrentCampWeek = () => {
    const today = new Date();
    if (today < CAMP_START_DATE) return 1;
    const diffTime = Math.abs(today - CAMP_START_DATE);
    const week = Math.ceil(Math.ceil(diffTime / (1000 * 60 * 60 * 24)) / 7);
    return week > 0 ? week : 1;
  };

  // --- 2. DIN SPECIELLA UTRÄKNING ---
  const customTotalStats = useMemo(() => {
    const currentWeek = getCurrentCampWeek();
    const weeklyLimit = currentWeek * 100;

    // A. Hjonens faktiska totala spendering (Allt som INTE är konfirmander)
    const hjonSpent = customers
      .filter(c => (c.type || "").toLowerCase() !== "konfirmand")
      .reduce((sum, c) => sum + (c.totalSpent || 0), 0);

    // B. Antal konfirmander * nuvarande maxgräns
    const konfirmandCount = customers
      .filter(c => (c.type || "").toLowerCase() === "konfirmand")
      .length;
    
    const konfirmandPot = konfirmandCount * weeklyLimit;

    // Totalen
    return {
      total: hjonSpent + konfirmandPot,
      hjonPart: hjonSpent,
      konfaPart: konfirmandPot,
      week: currentWeek,
      limit: weeklyLimit,
      count: konfirmandCount
    };
  }, [customers]);


  // Filtrera fram de som har skuld (som vanligt)
  const debtors = useMemo(() => {
    return customers
      .filter(c => c.currentBalance > 0)
      .sort((a, b) => b.currentBalance - a.currentBalance);
  }, [customers]);

  // Filtrera fram de som betalat klart
  const paidCustomers = useMemo(() => {
    return customers
      .filter(c => c.currentBalance <= 0 && c.totalSpent > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [customers]);

  return (
    <div className="economy-view">
      <div className="economy-container">
        
        {/* HEADER & MASS-ACTIONS */}
        <div className="economy-header-row">
            <div>
                <h1>💰 Skulder & Fakturering</h1>
            </div>
            <div style={{display:'flex', gap:'10px'}}>
                <button 
                  className="btn-action btn-email" 
                  onClick={() => onEmailAll('invoice')} 
                  disabled={isProcessing}
                >
                   📄 Fakturera Alla
                </button>
                <button 
                  className="btn-action btn-reminder" 
                  onClick={() => onEmailAll('reminder')} 
                  disabled={isProcessing}
                >
                   🔔 Påminn Alla
                </button>
            </div>
        </div>

        {/* --- NY STATISTIK-BOX --- */}
        <div style={{
          background: '#f1f8e9', 
          border: '1px solid #c5e1a5', 
          borderRadius: '8px', 
          padding: '15px', 
          marginBottom: '30px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '15px'
        }}>
          <div>
            <h3 style={{margin: '0 0 5px 0', color: '#33691e', fontSize: '1rem'}}>TOTAL PROGNOS (V.{customTotalStats.week})</h3>
            <div style={{fontSize: '0.9rem', color: '#558b2f'}}>
              Hjon ({customTotalStats.hjonPart} kr) + Konfirmander ({customTotalStats.count} st × {customTotalStats.limit} kr)
            </div>
          </div>
          <div style={{fontSize: '2rem', fontWeight: 'bold', color: '#2e7d32'}}>
            {customTotalStats.total} kr
          </div>
        </div>
        {/* ------------------------- */}

        {/* LISTA: SKULDER */}
        <h3 className="section-title">🛑 Aktuella Skulder ({debtors.length} st)</h3>
        <div className="debt-list">
          <div className="debt-header">
            <span>Namn</span>
            <span>Skuld</span>
            <span>E-post</span>
            <span>Åtgärd</span>
          </div>
          
          {debtors.length === 0 && (
            <div style={{padding:'20px', textAlign:'center', color:'#aaa'}}>
              Inga skulder just nu! 🎉
            </div>
          )}

          {debtors.map(c => (
            <div key={c.id} className="debt-row">
              <div>
                <strong>{c.name}</strong><br/>
                <span style={{fontSize:'0.8em', color:'#888'}}>{c.type}</span>
              </div>
              <span style={{color:'#e74c3c', fontWeight:'bold', fontSize:'1.1rem'}}>
                {c.currentBalance} kr
              </span>
              <span style={{fontSize:'0.8rem', color: c.email ? '#333':'#ccc'}}>
                {c.email || '(Saknas)'}
              </span>
              <div className="debt-actions">
                <button 
                  className="btn-action btn-register-payment" 
                  onClick={() => onOpenPayment(c)} 
                  title="Registrera betalning"
                >
                    💸 Registrera Betalning
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* LISTA: AVSLUTADE */}
        <h3 className="section-title" style={{marginTop:'40px', color:'#27ae60'}}>
          ✅ Avslutade / Nollade ({paidCustomers.length} st)
        </h3>
        <div className="debt-list">
            <div className="debt-header">
                <span>Namn</span>
                <span>Status</span>
                <span>Totalt köpt</span>
                <span>Åtgärd</span>
            </div>
            {paidCustomers.map(c => (
                <div key={c.id} className="debt-row">
                    <strong>{c.name}</strong>
                    <span style={{color:'#27ae60', fontWeight:'bold'}}>Skuldfri</span>
                    <span>{c.totalSpent} kr</span>
                    <div className="debt-actions">
                         <button 
                           className="btn-action btn-undo" 
                           onClick={() => onUndoPayment(c)}
                         >
                           ↩️ Ångra (Lägg till skuld)
                         </button>
                    </div>
                </div>
            ))}
        </div>

      </div>
    </div>
  );
};

export default EconomyView;