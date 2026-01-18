import { MONSTERS } from './monster-data.js';

function getStageMonsters(stage) {
    if (stage <= 0) return []; 
    const stagesPerGroup = 5; // 5 스테이지마다 몬스터 그룹 변경
    const groupIndex = Math.floor((stage - 1) / stagesPerGroup); 
    const group = MONSTERS[groupIndex % MONSTERS.length]; // 몬스터 그룹 순환
    
    const stageMonsters = [];
    // 일반 몬스터 추가 (스테이지의 80%는 일반 몬스터)
    for (let i = 0; i < Math.floor(stage * 0.8); i++) {
        const monsterKey = Object.keys(group).filter(k => k !== 'boss')[i % (Object.keys(group).length -1)];
        stageMonsters.push({ ...group[monsterKey], grade: 'Normal' });
    }
    // 엘리트 몬스터 추가 (스테이지의 20%는 엘리트 몬스터)
     for (let i = 0; i < Math.ceil(stage * 0.2); i++) {
        const monsterKey = Object.keys(group).filter(k => k !== 'boss')[i % (Object.keys(group).length - 1)];
        stageMonsters.push({ ...group[monsterKey], grade: 'Elite' });
    }
    return stageMonsters;
}

// 몬스터 체력과 골드를 스테이지와 등급에 따라 조정하는 함수
function scaleMonsterStats(monster, stage, grade) {
    const gradeMultiplier = { 'Normal': 1, 'Elite': 3, 'Boss': 10 };
    const multiplier = gradeMultiplier[grade] || 1;
    
    // 스테이지가 높아질수록 체력과 골드가 기하급수적으로 증가하도록 설정
    const scaleFactor = Math.pow(1.25, stage - 1);

    const scaledMonster = {
        ...monster, // 기본 몬스터 정보 복사
        hp: Math.floor(monster.hp * scaleFactor * multiplier),
        maxHp: Math.floor(monster.hp * scaleFactor * multiplier), // maxHp도 동일하게 설정
        gold: Math.floor(monster.gold * scaleFactor * multiplier),
        grade: grade, // 등급 설정
    };
    return scaledMonster;
}

// 현재 유저의 상태에 맞는 몬스터를 가져오는 함수
export function getCurrentMonster(user) {
    const stage = user.current_stage;
    const progress = user.stage_progress || 0;
    const requiredKills = stage; // 현재 스테이지 레벨만큼 킬 수 필요

    // 스테이지 킬 수를 모두 채웠으면 보스 몬스터 등장
    if (progress >= requiredKills) {
        const groupIndex = Math.floor((stage - 1) / 5) % MONSTERS.length;
        const bossTemplate = MONSTERS[groupIndex].boss;
        return scaleMonsterStats(bossTemplate, stage, 'Boss');
    } else {
        // 아직 킬 수를 채우는 중이면 일반 또는 엘리트 몬스터 등장
        const stageMonsters = getStageMonsters(stage);
        const monsterTemplate = stageMonsters[progress % stageMonsters.length];
        return scaleMonsterStats(monsterTemplate, stage, monsterTemplate.grade);
    }
}
