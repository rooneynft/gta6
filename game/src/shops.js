// Vice Supplies, the shop on the corner of 160th and -60th: health, ammo,
// a pistol and body armor, bought with mission money. The shop opens when
// the player walks up to its door and presses E.

import { ECONOMY, PLAYER } from './config.js';

export const SHOP_ITEMS = [
  { id: 'health', name: 'Medkit', desc: 'Restores 60 health', price: ECONOMY.healthPrice },
  { id: 'ammo', name: 'Pistol ammo', desc: '+24 rounds', price: ECONOMY.ammoPrice },
  { id: 'pistol', name: 'Pistol', desc: 'A reliable sidearm', price: ECONOMY.pistolPrice },
  { id: 'armor', name: 'Body armor', desc: '+50 armor, soaks damage first', price: ECONOMY.armorPrice },
];

export function buyItem(world, itemId) {
  const item = SHOP_ITEMS.find((i) => i.id === itemId);
  if (!item) return false;
  const p = world.player;
  if (itemId === 'pistol' && p.hasPistol) {
    world.banner = { text: 'You already own a pistol', sub: '', kind: 'bad', until: world.elapsed + 2 };
    return false;
  }
  if (p.cash < item.price) {
    world.banner = { text: 'Not enough cash', sub: `You need $${item.price}`, kind: 'bad', until: world.elapsed + 2 };
    return false;
  }
  p.cash -= item.price;
  if (itemId === 'health') p.hp = Math.min(p.hp + 60, PLAYER.maxHp);
  if (itemId === 'ammo') p.ammo += ECONOMY.ammoAmount;
  if (itemId === 'pistol') { p.hasPistol = true; p.ammo += ECONOMY.ammoAmount; }
  if (itemId === 'armor') p.armor = Math.min(100, (p.armor || 0) + 50);
  world.audio.cash();
  world.shopBought = itemId;
  world.banner = { text: `Bought: ${item.name}`, sub: `-$${item.price}`, kind: 'good', until: world.elapsed + 2 };
  return true;
}
