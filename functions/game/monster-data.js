export const MONSTERS = [
    // Group 1: Forest Creatures (Stages 1-5, 11-15, ...)
    {
        slime: { name: '슬라임', hp: 10, ap: 2, attack_speed: 0.5, gold: 2 },
        goblin: { name: '고블린', hp: 15, ap: 3, attack_speed: 0.8, gold: 3 },
        wolf: { name: '늑대', hp: 20, ap: 5, attack_speed: 1.0, gold: 5 },
        boss: { name: '오크 족장', hp: 100, ap: 10, attack_speed: 0.8, gold: 50 }
    },
    // Group 2: Undead (Stages 6-10, 16-20, ...)
    {
        skeleton: { name: '해골 병사', hp: 30, ap: 6, attack_speed: 0.7, gold: 8 },
        zombie: { name: '좀비', hp: 40, ap: 7, attack_speed: 0.6, gold: 10 },
        ghoul: { name: '구울', hp: 50, ap: 9, attack_speed: 0.9, gold: 12 },
        boss: { name: '리치', hp: 250, ap: 20, attack_speed: 0.7, gold: 120 }
    },
    // Group 3: Demons (Stages 11-15, 21-25, ...)
    {
        imp: { name: '임프', hp: 60, ap: 10, attack_speed: 1.2, gold: 15 },
        demon_warrior: { name: '악마 전사', hp: 80, ap: 15, attack_speed: 1.0, gold: 20 },
        succubus: { name: '서큐버스', hp: 100, ap: 18, attack_speed: 1.1, gold: 25 },
        boss: { name: '악마 군주', hp: 500, ap: 35, attack_speed: 0.9, gold: 250 }
    }
];
