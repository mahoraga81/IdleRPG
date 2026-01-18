import { MONSTERS } from './monster-data.js';

// Helper function to get a random monster from a specified group and grade
function getRandomMonster(group, grade = 'Normal') {
    const monsterKeys = Object.keys(group).filter(k => {
        if (grade === 'Boss') return k === 'boss';
        return k !== 'boss';
    });

    if (monsterKeys.length === 0) { // Fallback
        const fallbackGroup = MONSTERS[0];
        const fallbackKeys = Object.keys(fallbackGroup).filter(k => k !== 'boss');
        const randomKey = fallbackKeys[Math.floor(Math.random() * fallbackKeys.length)];
        return fallbackGroup[randomKey];
    }

    const randomKey = monsterKeys[Math.floor(Math.random() * monsterKeys.length)];
    return group[randomKey];
}

// Scale monster stats based on stage and grade
function scaleMonsterStats(monster, stage, grade) {
    if (!monster) {
        console.error("scaleMonsterStats: monster template is undefined.");
        monster = { name: 'Lost Goblin', hp: 10, ap: 1, gold: 1, attack_speed: 1 }; // Default fallback
    }

    const gradeMultiplier = { 'Normal': 1, 'Elite': 3, 'Boss': 10 };
    const multiplier = gradeMultiplier[grade] || 1;
    const scaleFactor = Math.pow(1.25, Math.max(0, stage - 1));

    const maxHp = Math.floor((monster.hp || 10) * scaleFactor * multiplier);
    const attackPower = Math.floor((monster.ap || 1) * scaleFactor * multiplier);

    return {
        ...monster,
        hp: maxHp,
        maxHp: maxHp,
        ap: attackPower,
        gold: Math.floor((monster.gold || 1) * scaleFactor * multiplier),
        grade: grade,
        // attack_speed is not scaled
    };
}

// Get the current monster for the user
export function getCurrentMonster(user) {
    const stage = user.current_stage || 1;
    const progress = user.stage_progress || 0;
    const stagesPerGroup = 5;
    const groupIndex = Math.floor((stage - 1) / stagesPerGroup) % MONSTERS.length;
    const monsterGroup = MONSTERS[groupIndex];

    // Boss Stage Logic
    if (stage % 10 === 0) {
        const bossTemplate = monsterGroup.boss;
        return scaleMonsterStats(bossTemplate, stage, 'Boss');
    }

    // Normal/Elite Monster Logic
    const requiredKills = 10; 
    const isElite = progress > 0 && progress % (requiredKills / 2) === 0; // Every 5th monster is an Elite
    const grade = isElite ? 'Elite' : 'Normal';
    
    const monsterTemplate = getRandomMonster(monsterGroup, 'Normal');

    return scaleMonsterStats(monsterTemplate, stage, grade);
}
