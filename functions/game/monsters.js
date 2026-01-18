const MONSTER_NAMES = [
    '슬라임', '고블린', '코볼트', '오크', '스켈레톤', '구울', '놀', '트롤', '골렘', '와이번'
];

const MONSTER_GRADES = [
    { name: 'Normal', color: '#FFFFFF', multiplier: 1 },
    { name: 'Elite', color: '#5a9bff', multiplier: 3 },
    { name: 'Boss', color: '#e91e63', multiplier: 10 },
];

/**
 * 주어진 스테이지 레벨에 대한 몬스터 데이터를 생성합니다.
 * @param {number} stage - 현재 스테이지 레벨.
 * @returns {object} 몬스터 정보 객체 (name, grade, hp, gold, etc.).
 */
export function getMonsterForStage(stage) {
    const isBossStage = stage % 10 === 0;
    const isEliteStage = !isBossStage && stage % 5 === 0;

    let grade;
    if (isBossStage) {
        grade = MONSTER_GRADES[2]; // Boss
    } else if (isEliteStage) {
        grade = MONSTER_GRADES[1]; // Elite
    } else {
        grade = MONSTER_GRADES[0]; // Normal
    }

    // 몬스터 이름은 스테이지 10개 단위로 바뀜 (e.g., 1-10: 슬라임, 11-20: 고블린)
    const nameIndex = Math.floor((stage - 1) / 10) % MONSTER_NAMES.length;
    const monsterName = MONSTER_NAMES[nameIndex];

    // 스테이지 기반 스탯 계산 공식 (조정 가능)
    const baseHp = 50;
    const hpScalingFactor = 1.22;
    const hp = Math.floor(baseHp * Math.pow(hpScalingFactor, stage - 1) * grade.multiplier);

    const baseGold = 5;
    const goldScalingFactor = 1.15;
    const gold = Math.floor(baseGold * Math.pow(goldScalingFactor, stage - 1) * grade.multiplier);
    
    return {
        name: `${grade.name} ${monsterName}`,
        grade: grade.name,
        hp: hp,
        maxHp: hp,
        gold: gold,
        stage: stage,
    };
}
