import { MONSTERS } from './monster-data.js';

function getStageMonsters(stage) {
    if (stage <= 0) stage = 1; // 스테이지가 0 이하일 경우 1로 보정

    const stagesPerGroup = 5; 
    const groupIndex = Math.floor((stage - 1) / stagesPerGroup) % MONSTERS.length;
    const group = MONSTERS[groupIndex];
    const monsterKeys = Object.keys(group).filter(k => k !== 'boss');

    if (monsterKeys.length === 0) {
        // 보스를 제외한 몬스터가 없는 경우에 대한 안전 장치
        // 이 경우, 다른 그룹의 몬스터를 가져오거나 기본 몬스터를 사용
        const fallbackGroup = MONSTERS[(groupIndex + 1) % MONSTERS.length];
        const fallbackKeys = Object.keys(fallbackGroup).filter(k => k !== 'boss');
        monsterKeys.push(...fallbackKeys);
    }

    const stageMonsters = [];
    const requiredKills = stage;

    // 항상 최소 1마리의 몬스터를 보장하고, 스테이지에 따라 몬스터 수를 늘림
    for (let i = 0; i < requiredKills; i++) {
        const monsterKey = monsterKeys[i % monsterKeys.length];
        const grade = (i > 0 && i % 4 === 0) ? 'Elite' : 'Normal'; // 5번째 몬스터마다 엘리트
        stageMonsters.push({ ...group[monsterKey], grade });
    }

    return stageMonsters;
}


// 몬스터 체력과 골드를 스테이지와 등급에 따라 조정하는 함수
function scaleMonsterStats(monster, stage, grade) {
    // monster가 undefined이거나 null일 경우를 대비한 방어 코드
    if (!monster) {
        console.error("scaleMonsterStats: monster is undefined. Stage:", stage, "Grade:", grade);
        // 기본값 또는 에러 처리에 적합한 대체 몬스터를 반환
        monster = { name: 'Lost Goblin', hp: 10, gold: 1, ...MONSTERS[0].goblin };
    }

    const gradeMultiplier = { 'Normal': 1, 'Elite': 3, 'Boss': 10 };
    const multiplier = gradeMultiplier[grade] || 1;
    
    const scaleFactor = Math.pow(1.25, Math.max(0, stage - 1));

    const scaledMonster = {
        ...monster, 
        hp: Math.floor(monster.hp * scaleFactor * multiplier),
        maxHp: Math.floor(monster.hp * scaleFactor * multiplier), 
        gold: Math.floor(monster.gold * scaleFactor * multiplier),
        grade: grade, 
    };
    return scaledMonster;
}

// 현재 유저의 상태에 맞는 몬스터를 가져오는 함수
export function getCurrentMonster(user) {
    const stage = user.current_stage;
    const progress = user.stage_progress || 0;
    const requiredKills = stage; 

    if (progress >= requiredKills) {
        const groupIndex = Math.floor((stage - 1) / 5) % MONSTERS.length;
        const bossTemplate = MONSTERS[groupIndex].boss;
        return scaleMonsterStats(bossTemplate, stage, 'Boss');
    } else {
        const stageMonsters = getStageMonsters(stage);
        // stageMonsters 배열이 비어있는지 재차 확인
        if (!stageMonsters || stageMonsters.length === 0) {
             console.error("getCurrentMonster: stageMonsters is empty. Stage:", stage);
             const fallbackMonster = { ...MONSTERS[0].goblin, grade: 'Normal' };
             return scaleMonsterStats(fallbackMonster, 1, 'Normal');
        }
        const monsterTemplate = stageMonsters[progress % stageMonsters.length];
        return scaleMonsterStats(monsterTemplate, stage, monsterTemplate.grade);
    }
}
