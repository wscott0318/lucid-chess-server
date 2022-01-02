const { alphaBet, roomStatus } = require('./packet');

module.exports = function (server) {
    const packet = require('./packet');
    const helper = require('./util');

    var io = require('socket.io').listen(server);
    const jsChessEngine = require('js-chess-engine')

    console.log('Socket.io server running:');

    const rooms = [];
    const users = [];

    // setInterval(() => {
    //     console.log(rooms);
    // }, 1000);

    const handleCreateRoom = (params, socket) => {
        const roomId = createNewRoom( params.friendMatch, socket, params.username, params.roomName );

        const roomIndex = getRoomIndexFromId( roomId );

        socket.emit( packet.socketEvents['SC_RoomCreated'], { roomId: roomId, roomName: params.roomName, roomKey: rooms[roomIndex].roomKey } );
    }

    const handleJoinRoom = (params, socket) => {
        const roomIndex = getRoomIndexFromId( params.roomId );
        if( roomIndex === -1 || rooms[roomIndex].players.length === 0 || !rooms[roomIndex].friendMatch ) {    // when room doesn't exist, create the match matching room
            socket.emit( packet.socketEvents['SC_ForceExit'], { message: 'Friend Match Room does not exist.' } );
        } else if( rooms[roomIndex].players.length > 1 ) {  // already more than 2 players on the room
            socket.emit( packet.socketEvents['SC_ForceExit'], { message: 'Another player already joined.' } );
        } else {
            rooms[roomIndex].players.push({
                socketId: socket.id,
                username: params.username
            });

            socket.join(rooms[roomIndex].id);
            socket.username = params.username;
            socket.roomId = rooms[roomIndex].id;

            socket.emit( packet.socketEvents['SC_JoinRoom'], { roomName: rooms[roomIndex].roomName, roomKey: rooms[roomIndex].roomKey } );
        }
    }

    const handleSelectPiece = ( params, socket ) => {
        const roomIndex = getRoomIndexFromId( socket.roomId );

        if( !isRightPlayer(roomIndex, socket) )  // illegal player sent message
            return;

        const { fen } = params;

        let possibleMoves = [];

        if( !rooms[roomIndex].matchStatus.obstacleArray )
            rooms[roomIndex].matchStatus.obstacleArray = [];

        const blockIndex = rooms[roomIndex].matchStatus.obstacleArray.findIndex((obstacle) => obstacle.position === fen && obstacle.type === packet.items['petrify']);
        if( blockIndex !== -1 ) {
            possibleMoves = [];
        } else {
            const newGame = new jsChessEngine.Game( rooms[roomIndex].matchStatus.game.board.configuration );

            if( rooms[roomIndex].matchStatus.obstacleArray ) {
                rooms[roomIndex].matchStatus.obstacleArray.forEach((obstacle) => {
                    if( obstacle.type === packet.items['iceWall'] ) {
                        const piece = newGame.board.configuration.turn === 'white' ? 'P' : 'p';
                        newGame.setPiece( obstacle.position, piece );
                    }
                });
            }
    
            possibleMoves = newGame.moves(fen);
    
            if( rooms[roomIndex].matchStatus.obstacleArray ) {
                rooms[roomIndex].matchStatus.obstacleArray.forEach((obstacle) => {
                    if( obstacle.type === packet.items['iceWall'] ) {
                        newGame.removePiece( obstacle.position );
                    }
                });
            }
        }

        io.sockets.to( rooms[roomIndex].id ).emit( packet.socketEvents['SC_SelectPiece'], { fen, possibleMoves } );
    }

    const handlePerformMove = ( params, socket ) => {
        const { from, to } = params;
        const roomIndex = getRoomIndexFromId( socket.roomId );

        if( !isRightPlayer(roomIndex, socket) )  // illegal player sent message
            return;

        const game = rooms[roomIndex].matchStatus.game;

        const fromPiece = game.board.configuration.pieces[from];

        const castling = {
            whiteLong: false,
            whiteShort: false,
            blackLong: false,
            blackShort: false,
        };

        // TODO : check if king castling case
        if( game.board.configuration.turn === 'white' ) {
            if( fromPiece === 'K' && to === 'C1' && game.board.configuration.castling.whiteLong ) {
                castling.whiteLong = true;
            } else if( fromPiece === 'K' && to === 'G1' && game.board.configuration.castling.whiteShort ) {
                castling.whiteShort = true;
            }
        } else if( game.board.configuration.turn === 'black' ) {
            if( fromPiece === 'k' && to === 'C8' && game.board.configuration.castling.blackLong ) {
                castling.blackLong = true;
            } else if( fromPiece === 'k' && to === 'G8' && game.board.configuration.castling.blackShort ) {
                castling.blackShort = true;
            }
        }

        // TODO : check if pawn arrived last spuare
        const currentTurn = game.board.configuration.turn;
        if( ( currentTurn === 'white' && fromPiece === 'P' && helper.getMatrixIndexFromFen(to)['rowIndex'] === 7 ) 
            || ( currentTurn === 'black' && fromPiece === 'p' && helper.getMatrixIndexFromFen(to)['rowIndex'] === 0 )
        ) {
            io.sockets.to( rooms[roomIndex].id ).emit( packet.socketEvents['SC_PawnTransform'], { from, to } );
  
            if( rooms[roomIndex].matchStatus.timeInterval )
                clearInterval(rooms[roomIndex].matchStatus.timeInterval);

            return;
        }

        checkIfGetItem( rooms[roomIndex], to, socket );

        rooms[roomIndex].matchStatus.game.move(from, to);
        io.sockets.to( rooms[roomIndex].id ).emit( packet.socketEvents['SC_PerformMove'], { from, to, castling } );

        changeTurn(roomIndex, socket);
    }

    const handlePawnTransform = ( params, socket ) => {
        const roomIndex = getRoomIndexFromId( socket.roomId );

        if( !isRightPlayer(roomIndex, socket) )  // illegal player sent message
            return;

        const { from, to, pieceType } = params;

        checkIfGetItem( rooms[roomIndex], to, socket );

        rooms[roomIndex].matchStatus.game.move( from, to );
        rooms[roomIndex].matchStatus.game.setPiece( to, pieceType );

        io.sockets.to( rooms[roomIndex].id ).emit( packet.socketEvents['SC_PerformMove'], { from, to, castling: {}, pieceType } );

        changeTurn(roomIndex, socket);
    }

    const changeTurn = (roomIndex, socket) => {
        if( !rooms[roomIndex] ) return;

        const currentTurn = rooms[roomIndex].matchStatus.game.board.configuration.turn;
        const currentPlayer = rooms[roomIndex].matchStatus[ currentTurn ];

        const isFinished = checkIfFinished(rooms[roomIndex].matchStatus.game);
        if( isFinished ) {
            rooms[roomIndex].status = packet.roomStatus['finished'];
            
            if( rooms[roomIndex].matchStatus.timeInterval )
                clearInterval(rooms[roomIndex].matchStatus.timeInterval);
        }

        let lastMoveHistory = null;
        if( rooms[roomIndex].matchStatus.game.board.history.length > 0 ) {
            lastMoveHistory = rooms[roomIndex].matchStatus.game.board.history.slice(-1)[0];
        }

        const kingFen = {};
        for( const i in rooms[roomIndex].matchStatus.game.board.configuration.pieces ) {
            const n = rooms[roomIndex].matchStatus.game.board.getPiece(i);
            if( rooms[roomIndex].matchStatus.game.board.isKing(n) ) {
                kingFen[n] = i;
            }
        }

        const dangerKing = {
            'K': rooms[roomIndex].matchStatus.game.board.isPieceUnderAttack( kingFen['K'] ),
            'k': rooms[roomIndex].matchStatus.game.board.isPieceUnderAttack( kingFen['k'] ),
        };

        const moves = jsChessEngine.moves( rooms[roomIndex].matchStatus.game.board.configuration );

        if( rooms[roomIndex].matchStatus.turnCount ) {
            rooms[roomIndex].matchStatus.turnCount ++;
        } else {
            rooms[roomIndex].matchStatus.turnCount = 1;
        }

        let randomItems;
        if( rooms[roomIndex].matchStatus.turnCount % 2 === 0 ) {
            randomItems = getRandomItems( rooms[roomIndex].matchStatus.game );
            rooms[roomIndex].matchStatus.randomItems = randomItems;
        }

        if( rooms[roomIndex].matchStatus.items ) {
            const prevPlayer = rooms[roomIndex].matchStatus[ currentTurn === 'white' ? 'black' : 'white' ];

            if( rooms[roomIndex].matchStatus.items[ prevPlayer ] ) {
                rooms[roomIndex].matchStatus.items[ prevPlayer ].forEach((item, idx) => {
                    item.life --;
                    if( item.life < 0 ) {
                        rooms[roomIndex].matchStatus.items[ prevPlayer ].splice(idx, 1);
                    }
                })
            }
        }

        if( rooms[roomIndex].matchStatus.obstacleArray ) {
            rooms[roomIndex].matchStatus.obstacleArray.forEach((item) => item.life -- );
            rooms[roomIndex].matchStatus.obstacleArray = rooms[roomIndex].matchStatus.obstacleArray.filter((item) => item.life > 0);
        }

        const data = { 
            moves, 
            game: rooms[roomIndex].matchStatus.game, 
            currentTurn, 
            currentPlayer, 
            isFinished, 
            lastMoveHistory, 
            dangerKing, 
            randomItems: rooms[roomIndex].matchStatus.randomItems, 
            userItems: rooms[roomIndex].matchStatus.items,
            obstacleArray: rooms[roomIndex].matchStatus.obstacleArray
        };

        io.sockets.to( rooms[roomIndex].id ).emit( packet.socketEvents['SC_ChangeTurn'], data );

        if( !isFinished )
            startNewTimer(roomIndex, socket);
    }

    const startNewTimer = (roomIndex, socket) => {
        rooms[roomIndex].matchStatus.remainingTime = packet.timeLimit;

        if( rooms[roomIndex].matchStatus.timeInterval )
            clearInterval(rooms[roomIndex].matchStatus.timeInterval);

        io.sockets.to( rooms[roomIndex].id ).emit( packet.socketEvents['SC_RemainingTime'], { remainingTime: rooms[roomIndex].matchStatus.remainingTime } );
        rooms[roomIndex].matchStatus.timeInterval = setInterval(() => {
            if( !rooms[roomIndex] ) {
                return;
            }

            const currentRemaining = rooms[roomIndex].matchStatus.remainingTime;

            if( currentRemaining === 0 && rooms[roomIndex].status !== packet.roomStatus['finished']) {
                // const result = jsChessEngine.aiMove(rooms[roomIndex].matchStatus.game.board.configuration, 0);

                // const from = Object.keys(result)[0];
                // const to = result[from];

                // const temp = {};
                // temp.roomId = socket.roomId;
                // for( let i = 0; i < rooms[roomIndex].players.length; i++ ) {
                //     if( rooms[roomIndex].players[i].socketId != socket.id )
                //         temp.id = rooms[roomIndex].players[i].socketId;
                // }

                // handlePerformMove( { from, to }, temp );

                changeGameTurn(roomIndex);
                changeTurn( roomIndex, socket );
                return;
            }

            rooms[roomIndex].matchStatus.remainingTime = currentRemaining - 1;

            io.sockets.to( rooms[roomIndex].id ).emit( packet.socketEvents['SC_RemainingTime'], { remainingTime: rooms[roomIndex].matchStatus.remainingTime } );
        }, 1000);
    }

    const handleUnSelectPiece = ( params, socket ) => {
        const roomIndex = getRoomIndexFromId( socket.roomId );

        if( !isRightPlayer(roomIndex, socket) )  // illegal player sent message
            return;

        io.sockets.to(socket.roomId).emit( packet.socketEvents['SC_UnSelectPiece'] );
    }

    const handleMatchPlayLogin = ( params, socket ) => {
        const roomIndex = rooms.findIndex((item) => item.friendMatch === false && item.status === packet.roomStatus['waiting'] && item.players.length === 1 && item.roomName === params.roomName );
        if( roomIndex === -1 ) {
            const roomId = createNewRoom( false, socket, params.username, params.roomName );

            const tempIndex = getRoomIndexFromId( roomId );

            socket.emit( packet.socketEvents['SC_RoomCreated'], { roomId: roomId, roomName: params.roomName, roomKey: rooms[tempIndex].roomKey } );
        } else {
            // Join existing room
            rooms[roomIndex].players.push({
                socketId: socket.id,
                username: params.username
            });

            socket.username = params.username;
            socket.roomId = rooms[roomIndex].id;
            socket.join( rooms[roomIndex].id );

            rooms[roomIndex].status = packet.roomStatus['waiting'];

            socket.emit( packet.socketEvents['SC_RoomCreated'], { roomId: rooms[roomIndex].id, roomName: params.roomName, roomKey: rooms[roomIndex].roomKey } );
        }
    }

    const handleActivateItem = ( params, socket ) => {
        const { effectArray, type } = params;

        const roomIndex = getRoomIndexFromId( socket.roomId );
        const room = rooms[roomIndex];

        const itemType = type;

        if( itemType === packet.items['iceWall'] ) {
            for( let i = 0; i < effectArray.length; i++ ) {
                const piece = room.matchStatus.game.board.configuration.pieces[effectArray[i]];
                if( piece ) return;
            }
        }

        if( itemType === packet.items['petrify'] ) {
            const piece = room.matchStatus.game.board.configuration.pieces[effectArray[0]];
            if( !piece || piece === 'Q' || piece === 'q' || piece === 'K' || piece === 'k' ) return;
        }

        if( !room.matchStatus.obstacleArray )
            room.matchStatus.obstacleArray = [];

        effectArray.forEach((item) => {
            room.matchStatus.obstacleArray.push({
                position: item,
                type: itemType,
                caster: socket.id,
                life: 2,
            })
        })

        const index = room.matchStatus.items[ socket.id ].findIndex((item) => item.type === itemType);
        room.matchStatus.items[ socket.id ].splice(index, 1);

        io.sockets.to( room.id ).emit( packet.socketEvents['SC_ActivateItem'], {obstacleArray: room.matchStatus.obstacleArray, userItems: room.matchStatus.items} );

        changeGameTurn(roomIndex);

        changeTurn(roomIndex, socket);
    }

    const handleReadyMatch = ( socket ) => {
        const roomIndex = getRoomIndexFromId( socket.roomId );
        const room = rooms[roomIndex];

        const playerIndex = room.players.findIndex((player) => player.socketId === socket.id);
        room.players[ playerIndex ].ready = true;

        if( room.players.length >= 2 && room.players[0].ready && room.players[1].ready ) {
            // inital room process;
            const whiteIndex = helper.getRandomVal(2);
            const blackIndex = whiteIndex === 0 ? 1 : 0;

            rooms[roomIndex].matchStatus = {
                game: new jsChessEngine.Game(),
                white: rooms[roomIndex].players[ whiteIndex ].socketId,
                black: rooms[roomIndex].players[ blackIndex ].socketId,
            }
            rooms[roomIndex].status = packet.roomStatus['inProgress'];

            io.sockets.to( rooms[roomIndex].id ).emit( packet.socketEvents['SC_GameStarted'], { white: rooms[roomIndex].matchStatus.white, black: rooms[roomIndex].matchStatus.black, players: rooms[roomIndex].players } );

            const currentTurn = rooms[roomIndex].matchStatus.game.board.configuration.turn;
            const currentPlayer = rooms[roomIndex].matchStatus[ currentTurn ];

            const randomItems = getRandomItems( rooms[roomIndex].matchStatus.game );
            rooms[roomIndex].matchStatus.randomItems = randomItems;
            io.sockets.to( rooms[roomIndex].id ).emit( packet.socketEvents['SC_ChangeTurn'], { currentTurn, currentPlayer, randomItems } );

            const temp = {
                id: currentTurn === 'white' ? rooms[roomIndex].matchStatus.black : rooms[roomIndex].matchStatus.white,
                roomId: socket.roomId
            }
            startNewTimer(roomIndex, temp);
        }
    }

    const handleDisconnect = (socket) => {
        if( socket.roomId ) {
            const roomIndex = getRoomIndexFromId( socket.roomId );

            if( roomIndex !== -1 && rooms[roomIndex] ) {
                if( rooms[roomIndex].roomStatus === roomStatus['waiting'] && rooms[roomIndex].players.length < 2 ) {
                    rooms.splice(roomIndex, 1);
                } else if( rooms[roomIndex].roomStatus === roomStatus['waiting'] && rooms[roomIndex].players.length >= 2 ) {
                    const players = rooms[roomIndex].players;
                    const playerIndex = players.findIndex((player) => player.socketId === socket.id);

                    if( playerIndex !== -1 )
                        players.splice(playerIndex, 1);
                } else {
                    io.sockets.to(socket.roomId).emit( packet.socketEvents['SC_PlayerLogOut'], { username: socket.username } );
                    if( rooms[roomIndex] && rooms[roomIndex].matchStatus && rooms[roomIndex].matchStatus.timeInterval )
                        clearInterval(rooms[roomIndex].matchStatus.timeInterval);
                    rooms.splice(roomIndex, 1);
                }
            }

            socket.leave(socket.roomId);
        }
    }


    io.sockets.on('connection', function (socket) {
        socket.on(packet.socketEvents['CS_CreateRoom'], (params) => handleCreateRoom( params, socket ));
        socket.on(packet.socketEvents['CS_JoinRoom'], (params) => handleJoinRoom( params, socket ));
        socket.on(packet.socketEvents['CS_SelectPiece'], (params) => handleSelectPiece( params, socket ));
        socket.on(packet.socketEvents['CS_PerformMove'], (params) => handlePerformMove( params, socket ));
        socket.on(packet.socketEvents['CS_PawnTransform'], (params) => handlePawnTransform( params, socket ));
        socket.on(packet.socketEvents['CS_UnSelectPiece'], (params) => handleUnSelectPiece( params, socket ));
        socket.on(packet.socketEvents['CS_MatchPlayLogin'], (params) => handleMatchPlayLogin( params, socket ));
        socket.on(packet.socketEvents['CS_ActivateItem'], (params) => handleActivateItem( params, socket ));
        socket.on(packet.socketEvents['CS_Ready'], () => handleReadyMatch( socket ));
        socket.on('disconnect', () => handleDisconnect(socket));
    });


    const getRoomIndexFromId = (id) => rooms.findIndex((item) => item.id === id);

    const getNewRoomId = () => {
        let roomId;
        while(true) {
            roomId = helper.encrypt( helper.randomString(26) );
            const roomIndex = getRoomIndexFromId( roomId );
            if( roomIndex === -1 ) {
                break;
            }
        }
        return roomId;
    }
    
    const createNewRoom = (friendMatch, socket, username, roomName) => {
        const roomId = getNewRoomId();
        const roomKey = helper.randomString(64);

        const status = packet.roomStatus['waiting'];
        const players = [{
            socketId: socket.id,
            username: username
        }];
        
        const roomInfo = {
            id: roomId,
            players,
            friendMatch,
            status,
            roomName,
            roomKey,
        };

        rooms.push(roomInfo);

        socket.join(roomId);
        socket.username = username;
        socket.roomId = roomId;

        return roomId;
    }

    const isRightPlayer = ( roomIndex, socket ) => {
        const currentTurn = rooms[roomIndex].matchStatus.game.board.configuration.turn;
        const currentPlayer = rooms[roomIndex].matchStatus[ currentTurn ];

        if( socket.id !== currentPlayer ) { // only accept the turn player message
            return false;
        }
        return true;
    }

    const checkIfFinished = (game) => {
        const moves = game.moves();
        let totalCount = 0;
        for( const i in moves ) {
            totalCount += moves[i].length;
        }

        return totalCount === 0 || game.board.configuration.isFinished;
    }

    const getRandomItems = (game) => {
        const count = 4 + helper.getRandomVal(2);   // get val 4 ~ 5

        const itemArray = [];

        for( let i = 0; i < count; i++ ) {
            while(true) {
                const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
                const val = helper.getRandomVal(64);    // get val 0 ~ 63
                const letter = letters[ Math.floor(val / 8) ];
                const num = val % 8 + 1;

                const fen = letter + num;
                
                const idx = itemArray.findIndex((item) => item.position === fen);

                const type = packet.items [ Object.keys( packet.items )[ helper.getRandomVal(5) ] ];
                // const type = packet.items ['thunderstorm'];

                if( !game.board.configuration.pieces[fen] && idx === -1 ) {
                    itemArray.push({
                        position: fen,
                        type: type,
                    })
                    break;
                }
            }
        }
        return itemArray;
    }

    const checkIfGetItem = (room, to, socket) => {
        const itemIndex = room.matchStatus.randomItems.findIndex((item) => item.position === to);
        if( itemIndex !== -1 ) {   // get the item
            if( !room.matchStatus.items )
                room.matchStatus.items = {};

            const currentTurn = room.matchStatus.game.board.configuration.turn;
            const currentPlayer = room.matchStatus[ currentTurn ];

            if( !room.matchStatus.items[ currentPlayer ] )
                room.matchStatus.items[ currentPlayer ] = [];

            const idx = room.matchStatus.items[ currentPlayer ].findIndex((item) => item.type === room.matchStatus.randomItems[ itemIndex ].type );

            if( idx === -1 && room.matchStatus.randomItems[ itemIndex ].type <= packet.items['jumpyShoe'] )    // only get one same item *** only activate items
                room.matchStatus.items[ currentPlayer ].push( { ...room.matchStatus.randomItems[ itemIndex ], life: 2 } );
            
            if( room.matchStatus.randomItems[ itemIndex ].type === packet.items['springPad'] ) {    // when get springpad trap
                const game = room.matchStatus.game;
                setTimeout(() => {
                    const matrixIndex = helper.getMatrixIndexFromFen( to );
                    if( currentTurn === 'white' )
                        matrixIndex.rowIndex = matrixIndex.rowIndex - 1;
                    else {
                        matrixIndex.rowIndex = matrixIndex.rowIndex + 1;
                    }

                    if( matrixIndex.rowIndex < 1 || matrixIndex.rowIndex > 8 ) {
                        return;
                    }

                    // move to position
                    const fromPosition = to;
                    const toPosition = helper.getFenFromMatrixIndex( matrixIndex.rowIndex, matrixIndex.colIndex );

                    const chessmanFrom = game.board.getPiece(fromPosition)

                    Object.assign(game.board.configuration.pieces, { [toPosition]: chessmanFrom });
                    delete game.board.configuration.pieces[ fromPosition ];
            
                    io.sockets.to( room.id ).emit( packet.socketEvents['SC_PerformMove'], { from: fromPosition, to: toPosition, castling: {} } );
                }, 700);
            }

            if( room.matchStatus.randomItems[ itemIndex ].type === packet.items['thunderstorm'] ) {
                const game = room.matchStatus.game;
                const count = Object.keys(game.board.configuration.pieces).length;

                const randomPositions = [];
                for( let i = 0; i < 2; i++ ) {
                    while(true) {
                        const val = helper.getRandomVal(count);

                        const fen = Object.keys(game.board.configuration.pieces)[ val ];

                        const index = randomPositions.findIndex((item) => item === fen);

                        if( index === -1 && game.board.configuration.pieces[ fen ] !== 'Q' && game.board.configuration.pieces[ fen ] !== 'q' && game.board.configuration.pieces[ fen ] !== 'K' && game.board.configuration.pieces[ fen ] !== 'k' ) {
                            if( !room.matchStatus.obstacleArray )
                                room.matchStatus.obstacleArray = [];

                            let mySide;
                            if( currentPlayer === socket.id  )
                                mySide = currentTurn;
                            else
                                mySide = currentTurn === 'white' ? 'black' : 'white';

                            let life;
                            if( (mySide === 'white' && game.board.configuration.pieces[ fen ] === game.board.configuration.pieces[ fen ].toUpperCase()) 
                                || (mySide === 'black' && game.board.configuration.pieces[ fen ] !== game.board.configuration.pieces[ fen ].toUpperCase())
                            ) {
                                life = 3;
                            } else {
                                life = 2;
                            }

                            room.matchStatus.obstacleArray.push({
                                position: fen,
                                type: packet.items['petrify'],
                                life: life,
                            })

                            randomPositions.push(fen);
                            break;
                        }
                    }
                }
            }

            room.matchStatus.randomItems.splice( itemIndex, 1 );
        }
    }

    const changeGameTurn = ( roomIndex ) => {
        rooms[roomIndex].matchStatus.game.board.configuration.turn = rooms[roomIndex].matchStatus.game.board.configuration.turn === 'white' ? 'black' : 'white';
    }
};
