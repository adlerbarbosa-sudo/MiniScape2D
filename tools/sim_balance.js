const B=require('../public/balance.js');
const pad=(s,n)=>String(s).padEnd(n), rp=(s,n)=>String(s).padStart(n);
const mode=process.argv[2]||'all';
if(mode==='all'||mode==='xp'){
 console.log('== XP por nível (total) ==');
 console.log('check 2=',B.xpForLevel(2),'10=',B.xpForLevel(10),'50=',B.xpForLevel(50),'99=',B.xpForLevel(99));
 console.log([1,2,5,10,15,20,30,40,50,60,70,80,90,99].map(L=>L+':'+B.fmtNum(B.xpForLevel(L))).join('  '));
}
if(mode==='all'||mode==='hp'){
 console.log('== HP / Mana / dano por nível (arma típica; guerreiro humano) ==');
 console.log(pad('Nv',4),pad('HP',6),pad('MP',5),pad('rating',7),pad('dano',10),pad('média',6),pad('crit max',9),pad('def R',7),pad('reduz%',7),'hitCap');
 for(const L of [1,5,10,20,30,40,50,60,70,80,90,99]){const r=B.playerDmgRange(L,B.typRating(L));const R=B.typDefR(L);
  console.log(pad(L,4),pad(B.maxHpForLevel(L),6),pad(B.maxMpForLevel(L),5),pad(B.typRating(L).toFixed(1),7),pad(r.lo+'-'+r.hi,10),pad(B.avgOf(r).toFixed(0),6),pad(Math.ceil(r.hi*1.5),9),pad(R.toFixed(0),7),pad((B.dmgReduction(R,L)*100).toFixed(0),7),B.hitCap(L));}
 console.log('== melhor arma (rating = ratingMax) ==');
 for(const L of [30,60,99]){const r=B.playerDmgRange(L,B.ratingMax(L));console.log('Nv',L,'rating',B.ratingMax(L).toFixed(1),'dano',r.lo+'-'+r.hi,'ativa x3:',Math.round(r.base*3),'x4.2:',Math.round(r.base*4.2*1.3));}
}
// tempo para subir (horas), 50% de aproveitamento
function hoursTo(target,skill){ // combat: XP/s = avg*(1/0.833)*XP_PER_DMG*XP_RATE*rel; simula nível a nível
 let xp=0,L=1,t=0; const up=0.5; while(L<target){ const r=B.playerDmgRange(L,B.typRating(L)); const rate=B.avgOf(r)/0.8333*B.XP_PER_DMG*B.XP_RATE*up; const need=B.xpForLevel(L+1)-B.xpForLevel(L); t+=need/rate/3600; L++; } return t; }
function hoursVit(target){ let L=1,t=0; while(L<target){ // dano sofrido por hora contra mobs do mesmo nível: ataques/s * hit * dmg medio * (1-red)
  const m=B.mobTable(L,'common'); const red=B.dmgReduction(B.typDefR(L),L+20); const perHit=m.avg*(1-red)*0.8; const dps=perHit/1.1667*0.5; const rate=dps*B.TAKEN_XP*B.XP_RATE; const need=B.xpForLevel(L+1)-B.xpForLevel(L); t+=need/rate/3600; L++; } return t; }
if(mode==='all'||mode==='time'){
 console.log('== horas p/ chegar ao nível (combate ofensivo, 50% de aproveitamento; XP_RATE='+B.XP_RATE+') ==');
 console.log([10,20,30,40,50,60,70,80,90,99].map(L=>L+': '+hoursTo(L).toFixed(1)+'h').join('  '));
 console.log('== horas p/ Vitalidade/Defesa (lutando sempre contra mobs comuns do mesmo nível) ==');
 console.log([10,20,30,40,50,60,70,80,90,99].map(L=>L+': '+hoursVit(L).toFixed(1)+'h').join('  '));
 // ofícios: lenhador 1 ação / max(0.5, 2.5-0.083L) s *0.6
 let L=1,t=0;const res=[];while(L<99){const act=Math.max(30,150-5*L)/60;const base=25*B.XP_RATE*B.tierScale(L);const rate=base/(act+0.4)*0.7;t+=(B.xpForLevel(L+1)-B.xpForLevel(L))/rate/3600;L++;if([10,30,50,70,99].includes(L))res.push(L+': '+t.toFixed(1)+'h');}
 console.log('== lenhador (25 XP base) ==',res.join('  '));
}
if(mode==='all'||mode==='mobs'){
 console.log('== monstros: nível, camada, vida, dano, golpes p/ matar (jogador típico do nível), golpes p/ morrer ==');
 console.log(pad('chave',17),pad('Nv',3),pad('camada',8),pad('HP',6),pad('dano',9),pad('TTK(hits)',10),pad('TTD(hits)',10),'XP combate ao matar');
 const rows=Object.keys(B.MOBS).map(k=>{const [lv,tier]=B.MOBS[k];const m=B.mobTable(lv,tier);return{k,lv,tier,m};}).sort((a,b)=>a.lv-b.lv||a.m.hp-b.m.hp);
 for(const {k,lv,tier,m} of rows){const pr=B.playerDmgRange(lv,B.typRating(lv));const ttk=m.hp/B.avgOf(pr);const red=B.dmgReduction(B.typDefR(lv),lv);const hp=B.maxHpForLevel(lv);
  const ttd=m.dmax>0?hp/((m.dmin+m.dmax)/2*(1-red)*B.mobHitChance(lv,lv)):Infinity;
  console.log(pad(k,17),pad(lv,3),pad(tier,8),pad(m.hp,6),pad(m.dmax>0?m.dmin+'-'+m.dmax:'-',9),pad(ttk.toFixed(1),10),pad(ttd===Infinity?'-':ttd.toFixed(1),10),Math.round(m.hp*B.XP_PER_DMG*B.XP_RATE));}
 console.log('== jogador MUITO acima/abaixo: mob +20 niveis contra jogador tipico ==');
 for(const L of [10,30,50,70]){const m=B.mobTable(L+20,'common');const red=B.dmgReduction(B.typDefR(L),L+20);const hp=B.maxHpForLevel(L);const d=(m.dmin+m.dmax)/2*(1-red)*B.levelEdge(L+20,L);console.log('jogador',L,'vs mob',L+20,'dano medio',d.toFixed(0),'-> morre em',(hp/(d*B.mobHitChance(L+20,L))).toFixed(1),'golpes; HP mob',m.hp,'TTK',(m.hp/B.avgOf(B.playerDmgRange(L,B.typRating(L)))).toFixed(0));}
}
