module.exports = {
    socketEvents: {
        'CS_CreateRoom': 0xff0001,
        'CS_JoinRoom': 0xff0002,
        'CS_SelectPiece': 0xff0003,
        'CS_PerformMove': 0xff0004,
        'CS_PawnTransform': 0xff0005,
        'CS_UnSelectPiece': 0xff0006,
        'CS_MatchPlayLogin': 0xff0007,
        'CS_ActivateItem': 0xff0008,
    
        'SC_RoomCreated': 0xff1001,
        'SC_GameStarted': 0xff1002,
        'SC_ChangeTurn': 0xff0103,
        'SC_PlayerLogOut': 0xff1004,
        'SC_ForceExit': 0xff1005,
        'SC_SelectPiece': 0xff1006,
        'SC_PawnTransform': 0xff1007,
        'SC_PerformMove': 0xff1008,
        'SC_UnSelectPiece': 0xff0009,
        'SC_RemainingTime': 0xff0010,
        'SC_ActivateItem': 0xff0011,
    },
    roomStatus: {
        'waiting': 0,
        'inProgress': 1,
        'finished': 2
    },
    items: {
        iceWall: 1,
        petrify: 2,
        jumpyShoe: 3,
        springPad: 4,
        thunderstorm: 5
    },
    timeLimit: 30,
}