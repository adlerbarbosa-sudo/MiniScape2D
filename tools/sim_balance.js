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
// tempo para subir (horas), 50% de aproveitamento do tempo em combate. mult = multiplicador de XP do papel (VIP) ; early = impulso de iniciante (earlyMul)
function hoursTo(target,mult){ mult=mult||1; let L=1,t=0; const up=0.5; while(L<target){ const r=B.playerDmgRange(L,B.typRating(L)); const rate=B.avgOf(r)/0.8333*B.XP_PER_DMG*B.XP_RATE*up*B.earlyMul(L)*mult; const need=B.xpForLevel(L+1)-B.xpForLevel(L); t+=need/rate/3600; L++; } return t; }
function hoursVit(target,mult){ mult=mult||1; let L=1,t=0; while(L<target){ // dano sofrido por hora contra mobs do mesmo nível: ataques/s * hit * dmg medio * (1-red)
  const m=B.mobTable(L,'common'); const red=B.dmgReduction(B.typDefR(L),L+20); const perHit=m.avg*(1-red)*0.8; const dps=perHit/1.1667*0.5; const rate=dps*B.TAKEN_XP*B.XP_RATE*B.earlyMul(L)*mult; const need=B.xpForLevel(L+1)-B.xpForLevel(L); t+=need/rate/3600; L++; } return t; }
function hoursGather(target,mult,base){ mult=mult||1; base=base||25; let L=1,t=0; while(L<target){ const act=Math.max(30,150-5*L)/60; const b=base*B.XP_RATE*B.tierScale(L)*B.earlyMul(L)*mult; const rate=b/(act+0.4)*0.7; t+=(B.xpForLevel(L+1)-B.xpForLevel(L))/rate/3600; L++; } return t; }
const LV=[10,20,30,40,50,60,70,80,90,99];
if(mode==='all'||mode==='time'){
 console.log('== Ritmo (XP_RATE='+B.XP_RATE+', XP_PER_DMG='+B.XP_PER_DMG+', TAKEN_XP='+B.TAKEN_XP+', impulso de iniciante x'+B.earlyMul(1).toFixed(2)+' no nível 1 -> x1,00 no 30) ==');
 console.log('Horas até o nível, combate ofensivo (50% de aproveitamento), jogador SEM VIP:');
 console.log(LV.map(L=>L+': '+hoursTo(L).toFixed(1)+'h').join('  '));
 console.log('Vitalidade/Defesa (lutando sempre contra mobs comuns do mesmo nível; treinam JUNTO com o combate ofensivo):');
 console.log(LV.map(L=>L+': '+hoursVit(L).toFixed(1)+'h').join('  '));
 console.log('Ofício de coleta (lenhador, 25 XP base):');
 console.log(LV.map(L=>L+': '+hoursGather(L).toFixed(1)+'h').join('  '));
 const c99=hoursTo(99), v99=hoursVit(99), g99=hoursGather(99);
 console.log('\n== VIP modesto (só XP: Light x'+B.roleXpMul('vip_light')+', Full x'+B.roleXpMul('vip_full')+'; admin x'+B.roleXpMul('admin')+') ==');
 for(const r of ['player','vip_light','vip_full']) console.log(pad(r,10),'combate 99:',hoursTo(99,B.roleXpMul(r)).toFixed(0)+'h','  vitalidade 99:',hoursVit(99,B.roleXpMul(r)).toFixed(0)+'h','  lenhador 99:',hoursGather(99,B.roleXpMul(r)).toFixed(0)+'h','  (economia vs sem VIP: '+((1-1/B.roleXpMul(r))*100).toFixed(0)+'% do tempo)');
 // todas as 16 perícias: 3 estilos de combate (cada um precisa de ~c99 h; Vitalidade/Defesa sobem junto com qualquer um deles) + 11 ofícios
 const craft=[['woodcutting',25],['mining',25],['smithing',30],['firemaking',20],['cooking',20],['crafting',22],['fishing',25],['farming',22],['alchemy',28],['enchanting',30],['prayer',14]];
 let crafts=0; for(const [k,b] of craft) crafts+=hoursGather(99,1,b);
 console.log('\n== 99 em TODAS as perícias (sem VIP, sem pausa) ==');
 console.log('3 estilos de combate:',(3*c99).toFixed(0)+'h (Vitalidade e Defesa vêm junto: '+v99.toFixed(0)+'h cada, em paralelo)  +  11 ofícios:',crafts.toFixed(0)+'h  =>  total ~'+(3*c99+crafts).toFixed(0)+' h');
 console.log('Alvo: combate 250-400 h por perícia; total acima de 1.000 h.  Depois do 99 vem a Maestria (níveis 1-50 por perícia, '+B.fmtNum(Math.round(masteryXp(50)))+' XP além do 99 para o 50).');
}
function masteryXp(n){ let t=0; for(let i=1;i<=n;i++) t+=500000+25000*(i-1); return t; }

if(mode==='all'||mode==='mobs'){
 console.log('== monstros: nível, camada, vida, dano, golpes p/ matar (jogador típico do nível), golpes p/ morrer ==');
 console.log(pad('chave',17),pad('Nv',3),pad('camada',8),pad('HP',6),pad('dano',9),pad('TTK(hits)',10),pad('TTD(hits)',10),'XP combate ao matar');
 const rows=Object.keys(B.MOBS).map(k=>{const [lv,tier]=B.MOBS[k];const m=B.mobTable(lv,tier);return{k,lv,tier,m};}).sort((a,b)=>a.lv-b.lv||a.m.hp-b.m.hp);
 for(const {k,lv,tier,m} of rows){const pr=B.playerDmgRange(lv,B.typRating(lv));const ttk=m.hp/B.avgOf(pr);const red=B.dmgReduction(B.typDefR(lv),lv);const hp=B.maxHpForLevel(lv);
  const ttd=m.dmax>0?hp/((m.dmin+m.dmax)/2*(1-red)*B.mobHitChance(lv,lv)):Infinity;
  console.log(pad(k,17),pad(lv,3),pad(tier,8),pad(m.hp,6),pad(m.dmax>0?m.dmin+'-'+m.dmax:'-',9),pad(ttk.toFixed(1),10),pad(ttd===Infinity?'-':ttd.toFixed(1),10),Math.round(m.hp*B.XP_PER_DMG*B.XP_RATE));}
 console.log('== jogador MUITO acima/abaixo: mob +20 niveis contra jogador tipico ==');
 for(const L of [10,30,50,70]){const m=B.mobTable(L+20,'common');const red=B.dmgReduction(B.typDefR(L),L+20);const hp=B.maxHpForLevel(L);const d=(m.dmin+m.dmax)/2*(1-red)*B.levelEdge(L+20,L);console.log('jogador',L,'vs mob',L+20,'dano medio',d.toFixed(0),'-> morre em',(hp/(d*B.mobHitChance(L+20,L))).toFixed(1),'golpes; HP mob',m.hp,'TTK',(m.hp/B.avgOf(B.playerDmgRange(L,B.typRating(L)))).toFixed(0));}

 console.log('== Criaturas do Dev: HP final = base + HP/nivel x nivel; XP por golpe = xpBase x dano efetivo / vida final ==');
 for(const d of [{hpBase:1000,level:100,hpLvl:10,xp:1000,hit:50},{hpBase:500,level:50,group:'chefe',xp:5000,hit:80},{hpBase:300,level:40,hpLvl:0,xp:300,hit:12,hitLvl:2}]){
  const mob=Object.assign({adm:true,balV:2},d); B.applyMob('dev_x',mob); const hp=mob.hp, per=B.mobXpFor(mob,1,hp,hp), tk=B.damageTakenXp(100,mob.level,mob.level,B.xpPerHp(mob,hp)).defence;
  console.log('  hp base',d.hpBase,'nivel',d.level,'hp/nivel',B.hpPerLevel(mob),'=> HP final',hp,'| dano',mob.dmin+'-'+mob.dmax,'| xpBase',d.xp,'=> XP por 1 HP tirado',per.toFixed(3),'(x XP_RATE '+(per*B.XP_RATE).toFixed(3)+') | XP de Defesa por 100 de dano sofrido',tk.toFixed(1));
 }
}
