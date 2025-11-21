// JD_Muscle: Three design directions (Email + Landing)
// File: JD_Muscle_Three_Designs.jsx
// This single-file React + Tailwind preview contains 3 variants: Premium Black, Tech Hybrid, Promo Energy.

import React from 'react';

const PlaceholderImage = ({w=800,h=450,alt='placeholder'}) => (
  <div style={{width:'100%',height: h/2,background:'#ddd',display:'flex',alignItems:'center',justifyContent:'center'}}>{alt}</div>
);

const TokenSets = {
  premium: {
    bg:'#0B1220', accent:'#E63946', text:'#FFFFFF', muted:'#9CA3AF'
  },
  tech: {
    bg:'#071028', accent:'#08AEEA', text:'#E6F7FF', muted:'#9FB4C8'
  },
  promo: {
    bg:'#FFF7F0', accent:'#FF6B6B', text:'#111827', muted:'#7A4F3D'
  }
};

function Hero({variant='premium', style='email'}) {
  const t = TokenSets[variant];
  return (
    <section style={{background:t.bg,color:t.text,padding: style==='email'? '28px':'48px',borderRadius:8}}>
      <div style={{maxWidth: style==='email'? 600:1100,margin:'0 auto'}}>
        <h1 style={{fontSize: style==='email'?28:44,margin:0}}>You Didn’t Buy a Subaru to Play It Safe</h1>
        <p style={{color:t.muted,marginTop:12,maxWidth:600}}>Let’s help you bring your build to life with parts that match how you really drive.</p>
        <div style={{marginTop:20}}>
          <button style={{background:t.accent,color:'#fff',border:'none',padding:'12px 20px',borderRadius:6}}>SHOP YOUR BUILD</button>
          <button style={{marginLeft:12,background:'transparent',border:`1px solid ${t.text}`,color:t.text,padding:'10px 18px',borderRadius:6}}>START BUILDING</button>
        </div>
        <div style={{marginTop:24}}>
          <PlaceholderImage alt={`${variant} hero`} h={style==='email'?220:320} />
        </div>
      </div>
    </section>
  );
}

function Features({variant='tech', style='email'}) {
  const t = TokenSets[variant];
  return (
    <section style={{padding: style==='email'? '20px':'48px',background: variant==='promo' ? '#fff' : '#fff'}}>
      <div style={{maxWidth: style==='email'? 600:1100,margin:'0 auto',color:t.text}}>
        <h2 style={{color: variant==='promo'? '#111':'#071028'}}>For Drivers Who Actually Drive</h2>
        <p style={{color: variant==='promo'? '#444':t.muted}}>When you picked your Subaru, was it for the power, the grip or that boxer growl? Whatever it was, our parts were designed to match that same energy.</p>
        <div style={{display:'flex',gap:12,marginTop:18,flexWrap:'wrap'}}>
          {['WRX','STI','BRZ'].map(x=> (
            <div key={x} style={{flex:'1 1 160px',background:'#fff',padding:12,borderRadius:8,boxShadow:'0 4px 12px rgba(0,0,0,0.06)',textAlign:'center'}}>
              <div style={{height:120,display:'flex',alignItems:'center',justifyContent:'center'}}>{x} Image</div>
              <div style={{marginTop:8,fontWeight:600}}>{x}</div>
              <button style={{marginTop:8,padding:'8px 12px',background:TokenSets[variant].accent,color:'#fff',borderRadius:6,border:'none'}}>SHOP NOW</button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Testimonials({variant='premium', style='email'}) {
  const t = TokenSets[variant];
  return (
    <section style={{padding:'20px',background: variant==='promo' ? '#FDF3F3':'#F8FAFC'}}>
      <div style={{maxWidth: style==='email'?600:1100,margin:'0 auto'}}>
        <h3 style={{marginBottom:10}}>Customer Love</h3>
        <div style={{display:'grid',gridTemplateColumns: style==='email' ? '1fr' : '1fr 1fr',gap:12}}>
          <blockquote style={{padding:12,background:'#fff',borderRadius:8}}>
            "Perfect — The build quality is really good. LED's are bright... Highly recommend this product." 
            <div style={{marginTop:8,fontSize:12}}>— Justin, July 9, 2025</div>
          </blockquote>
          <blockquote style={{padding:12,background:'#fff',borderRadius:8}}>
            "Bravo!! I paired the brace in red with the sport grille and I'm in love... shipping was incredibly fast." 
            <div style={{marginTop:8,fontSize:12}}>— Cam, July 6, 2025</div>
          </blockquote>
        </div>
      </div>
    </section>
  );
}

function Footer({variant='premium', style='email'}) {
  return (
    <footer style={{padding:20,background:'#111',color:'#fff',textAlign:'center'}}>
      <div style={{maxWidth: style==='email'?600:1100,margin:'0 auto'}}>
        <div style={{display:'flex',justifyContent:'center',gap:18}}>
          <div>2 Year Warranty</div>
          <div>Money Back Guarantee</div>
          <div>Free Shipping</div>
        </div>
        <div style={{marginTop:12,fontSize:12}}>© 2025 JD Muscle</div>
      </div>
    </footer>
  );
}

export default function JDThree() {
  return (
    <div style={{fontFamily:'Inter, system-ui, Arial, sans-serif'}}>
      <h2 style={{textAlign:'center',padding:20}}>Premium Black — Email</h2>
      <Hero variant='premium' style='email' />
      <Features variant='premium' style='email' />
      <Testimonials variant='premium' style='email' />
      <Footer variant='premium' style='email' />

      <h2 style={{textAlign:'center',padding:20}}>Premium Black — Landing</h2>
      <Hero variant='premium' style='landing' />
      <Features variant='premium' style='landing' />
      <Testimonials variant='premium' style='landing' />
      <Footer variant='premium' style='landing' />

      <h2 style={{textAlign:'center',padding:20}}>Tech Hybrid — Email</h2>
      <Hero variant='tech' style='email' />
      <Features variant='tech' style='email' />
      <Testimonials variant='tech' style='email' />
      <Footer variant='tech' style='email' />

      <h2 style={{textAlign:'center',padding:20}}>Tech Hybrid — Landing</h2>
      <Hero variant='tech' style='landing' />
      <Features variant='tech' style='landing' />
      <Testimonials variant='tech' style='landing' />
      <Footer variant='tech' style='landing' />

      <h2 style={{textAlign:'center',padding:20}}>Promo Energy — Email</h2>
      <Hero variant='promo' style='email' />
      <Features variant='promo' style='email' />
      <Testimonials variant='promo' style='email' />
      <Footer variant='promo' style='email' />

      <h2 style={{textAlign:'center',padding:20}}>Promo Energy — Landing</h2>
      <Hero variant='promo' style='landing' />
      <Features variant='promo' style='landing' />
      <Testimonials variant='promo' style='landing' />
      <Footer variant='promo' style='landing' />
    </div>
  );
}

/*
-----------------------------
Figma JSONs (for plugin use)
-----------------------------
Copy these into a file called `JD_Figma_JSONs.txt` — do NOT keep inside the .jsx file.
Paste in Figma via JSON import plugin.

--- JD_PremiumBlack_Email ---
{name:"JD_PremiumBlack_Email",type:"FRAME",...}

--- JD_TechHybrid_Landing ---
{name:"JD_TechHybrid_Landing",type:"FRAME",...}

--- JD_PromoEnergy_Email ---
{name:"JD_PromoEnergy_Email",type:"FRAME",...}
*/
