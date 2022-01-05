const { roomStatus } = require('./packet');
const { getMatrixIndexFromFen, getFenFromMatrixIndex } = require('./util');
var mongoose = require('mongoose');

module.exports = function (server) {
    var RankModel = mongoose.model('Rank');

    const packet = require('./packet');
    const helper = require('./util');

    var io = require('socket.io').listen(server);
    const jsChessEngine = require('js-chess-engine')

    console.log('Socket.io server running:');

    const rooms = [];

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

        const { fen, currentItem } = params;

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

            if( currentItem === packet.items['jumpyShoe'] ) {
                const currentPiece = newGame.board.configuration.pieces[ fen ];
                const matrixIndex = getMatrixIndexFromFen(fen);

                if( currentPiece === 'P' ) {
                    const nextFen = getFenFromMatrixIndex( matrixIndex.rowIndex + 1, matrixIndex.colIndex );
                    const nextPiece = newGame.board.configuration.pieces[ nextFen ];

                    const targetFen = getFenFromMatrixIndex( matrixIndex.rowIndex + 2, matrixIndex.colIndex );
                    const targetPiece = newGame.board.configuration.pieces[ targetFen ];

                    if( nextPiece && matrixIndex.rowIndex < 6 && targetPiece !== 'K' && targetPiece !== 'k' ) {
                        possibleMoves.push( targetFen );
                    }
                } else if( currentPiece === 'p' ) {
                    const nextFen = getFenFromMatrixIndex( matrixIndex.rowIndex - 1, matrixIndex.colIndex );
                    const nextPiece = newGame.board.configuration.pieces[ nextFen ];

                    const targetFen = getFenFromMatrixIndex( matrixIndex.rowIndex - 2, matrixIndex.colIndex );
                    const targetPiece = newGame.board.configuration.pieces[ targetFen ];

                    if( nextPiece && matrixIndex.rowIndex > 1 && targetPiece !== 'K' && targetPiece !== 'k' ) {
                        possibleMoves.push( targetFen );
                    }
                }

                if( currentPiece === 'Q' ) {
                    let targetFen;
                    for( let i = matrixIndex.rowIndex + 1; i < 8; i++  ) {
                        const temp = getFenFromMatrixIndex( i, matrixIndex.colIndex );
                        const temp_piece = newGame.board.configuration.pieces[ temp ];
                        if( temp_piece ) {
                            targetFen = temp;
                            break;
                        }
                    }

                    if( targetFen ) {
                        const targetPiece = newGame.board.configuration.pieces[ targetFen ];

                        newGame.removePiece( targetFen );
                        possibleMoves = newGame.moves( fen );
                        newGame.setPiece( targetFen, targetPiece );

                        const targetIndex = possibleMoves.findIndex((item) => item === targetFen);
                        if( targetIndex !== -1 )
                            possibleMoves.splice( targetIndex, 1 );

                        const kingIndex = possibleMoves.findIndex((moveFen) => newGame.board.configuration.pieces[ moveFen ] === 'K' || newGame.board.configuration.pieces[ moveFen ] === 'k' )
                        if( kingIndex !== -1 ) {
                            possibleMoves.splice( kingIndex, 1 );
                        }
                    }
                }
                else if( currentPiece === 'q' ) {
                    let targetFen;
                    for( let i = matrixIndex.rowIndex - 1; i >= 0; i--  ) {
                        const temp = getFenFromMatrixIndex( i, matrixIndex.colIndex );
                        const temp_piece = newGame.board.configuration.pieces[ temp ];
                        if( temp_piece ) {
                            targetFen = temp;
                            break;
                        }
                    }

                    if( targetFen ) {
                        const targetPiece = newGame.board.configuration.pieces[ targetFen ];

                        newGame.removePiece( targetFen );
                        possibleMoves = newGame.moves( fen );
                        newGame.setPiece( targetFen, targetPiece );

                        const targetIndex = possibleMoves.findIndex((item) => item === targetFen);
                        if( targetIndex !== -1 )
                            possibleMoves.splice( targetIndex, 1 );

                        const kingIndex = possibleMoves.findIndex((moveFen) => newGame.board.configuration.pieces[ moveFen ] === 'K' || newGame.board.configuration.pieces[ moveFen ] === 'k' )
                        if( kingIndex !== -1 ) {
                            possibleMoves.splice( kingIndex, 1 );
                        }
                    }
                }
            }
    
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

        const enPassant = game.board.configuration.enPassant;

        // TODO : check if pawn arrived last spuare
        const currentTurn = game.board.configuration.turn;
        if( ( currentTurn === 'white' && fromPiece === 'P' && helper.getMatrixIndexFromFen(to)['rowIndex'] === 7 ) 
            || ( currentTurn === 'black' && fromPiece === 'p' && helper.getMatrixIndexFromFen(to)['rowIndex'] === 0 )
        ) {
            const trapIndex = rooms[roomIndex].matchStatus.randomItems.findIndex((item) => item.position === to && item.type === packet.items['springPad']);

            if( trapIndex === -1 ) {
                io.sockets.to( rooms[roomIndex].id ).emit( packet.socketEvents['SC_PawnTransform'], { from, to } );
  
                if( rooms[roomIndex].matchStatus.timeInterval )
                    clearInterval(rooms[roomIndex].matchStatus.timeInterval);
    
                return;
            }
        }

        checkIfGetItem( rooms[roomIndex], to, socket, fromPiece );

        if( rooms[roomIndex].matchStatus.currentItem === packet.items['jumpyShoe'] ) {
            // move to position
            const game = rooms[roomIndex].matchStatus.game;
            const chessmanFrom = game.board.getPiece( from );

            Object.assign(game.board.configuration.pieces, { [to]: chessmanFrom })
            delete game.board.configuration.pieces[from]

            changeGameTurn( roomIndex );
        } else {
            try {
                rooms[roomIndex].matchStatus.game.move(from, to);   
            } catch (error) {
                console.log(error);
            }
        }
        io.sockets.to( rooms[roomIndex].id ).emit( packet.socketEvents['SC_PerformMove'], { from, to, castling, enPassant } );

        // check if trap for king
        const piece = rooms[roomIndex].matchStatus.game.board.configuration.pieces[to];
        if( piece === 'K' || piece === 'k' ) {
            const kingMoves = rooms[roomIndex].matchStatus.game.board.getPieceMoves( piece, to );

            const temp = [];
            rooms[roomIndex].matchStatus.randomItems.forEach((item) => {
                if( item.type === packet.items['springPad'] ) {
                    if( kingMoves.findIndex((move) => item.position === move) === -1 ) {
                        temp.push(item);
                    }
                } else {
                    temp.push(item);
                }
            })

            rooms[roomIndex].matchStatus.randomItems = [ ...temp ];
        }

        changeTurn(roomIndex, socket);
    }

    const handlePawnTransform = ( params, socket ) => {
        const roomIndex = getRoomIndexFromId( socket.roomId );

        if( !isRightPlayer(roomIndex, socket) )  // illegal player sent message
            return;

        const { from, to, pieceType } = params;

        checkIfGetItem( rooms[roomIndex], to, socket, pieceType );

        if( rooms[roomIndex].matchStatus.currentItem === packet.items['jumpyShoe'] ) {
            // move to position
            const game = rooms[roomIndex].matchStatus.game;
            const chessmanFrom = game.board.getPiece( from );

            Object.assign(game.board.configuration.pieces, { [to]: chessmanFrom })
            delete game.board.configuration.pieces[from]

            changeGameTurn( roomIndex );
        } else {
            try {
                rooms[roomIndex].matchStatus.game.move(from, to);   
            } catch (error) {
                console.log(error);
            }
        }

        rooms[roomIndex].matchStatus.game.setPiece( to, pieceType );

        const enPassant = rooms[roomIndex].matchStatus.game.board.configuration.enPassant;

        io.sockets.to( rooms[roomIndex].id ).emit( packet.socketEvents['SC_PerformMove'], { from, to, castling: {}, pieceType, enPassant } );

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

            // database integration
            const roomInfo = { ...rooms[roomIndex] };

            if( !roomInfo.friendMatch ) {
                const turn = roomInfo.matchStatus.game.board.configuration.turn;
                const winner = roomInfo.matchStatus[ turn === 'white'? 'black' : 'white' ];
                const loser = roomInfo.matchStatus[ turn ];
                const winnerName = roomInfo.players[0].socketId === winner ? roomInfo.players[0].walletAddress : roomInfo.players[1].walletAddress;
                const loserName = roomInfo.players[0].socketId === loser ? roomInfo.players[0].walletAddress : roomInfo.players[1].walletAddress;
                const roomName = roomInfo.roomName;
    
                addRankRecord( winnerName, loserName, roomName );
            }
        }

        let lastMoveHistory = null;
        if( rooms[roomIndex].matchStatus.game.board.history.length > 0 ) {
            lastMoveHistory = rooms[roomIndex].matchStatus.game.board.history.slice(-1)[0];
            lastMoveHistory = { from: lastMoveHistory.from, to: lastMoveHistory.to };
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

                if( rooms[roomIndex].matchStatus.currentItem === packet.items['jumpyShoe'] ) {
                    const index = rooms[roomIndex].matchStatus.items[ prevPlayer ].findIndex((item) => item.type === packet.items['jumpyShoe']);
                    if( index !== -1 )
                        rooms[roomIndex].matchStatus.items[ prevPlayer ].splice(index, 1);
                }
            }
        }

        if( rooms[roomIndex].matchStatus.currentItem ) {
            rooms[roomIndex].matchStatus.currentItem = null;
        }

        if( rooms[roomIndex].matchStatus.obstacleArray ) {
            rooms[roomIndex].matchStatus.obstacleArray.forEach((item) => item.life -- );
            rooms[roomIndex].matchStatus.obstacleArray = rooms[roomIndex].matchStatus.obstacleArray.filter((item) => item.life > 0);
        }

        const data = { 
            moves, 
            pieces: rooms[roomIndex].matchStatus.game.board.configuration.pieces,
            // game: rooms[roomIndex].matchStatus.game, 
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
            if( !rooms[roomIndex] || !rooms[roomIndex].matchStatus ) {
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

        if( itemType === packet.items['petrify'] ) {
            const piece = room.matchStatus.game.board.configuration.pieces[effectArray[0]];
            if( !piece || piece === 'Q' || piece === 'q' || piece === 'K' || piece === 'k' ) return;
        }

        if( !room.matchStatus.obstacleArray )
            room.matchStatus.obstacleArray = [];

        effectArray.forEach((item) => {
            if( itemType === packet.items['petrify'] ) {
                room.matchStatus.obstacleArray.push({
                    position: item,
                    type: itemType,
                    caster: socket.id,
                    life: 2,
                })
            } else {
                const piece = room.matchStatus.game.board.configuration.pieces[ item ];

                if( !piece ){
                    room.matchStatus.obstacleArray.push({
                        position: item,
                        type: itemType,
                        caster: socket.id,
                        life: 2,
                    })
                }
            }
        })

        const index = room.matchStatus.items[ socket.id ].findIndex((item) => item.type === itemType);
        if( index !== -1 )
            room.matchStatus.items[ socket.id ].splice(index, 1);

        io.sockets.to( room.id ).emit( packet.socketEvents['SC_ActivateItem'], {obstacleArray: room.matchStatus.obstacleArray, userItems: room.matchStatus.items} );

        // changeGameTurn(roomIndex);

        // changeTurn(roomIndex, socket);
    }

    const handleReadyMatch = ( params, socket ) => {
        const { walletAddress } = params;

        const roomIndex = getRoomIndexFromId( socket.roomId );

        const room = rooms[roomIndex];

        if( !room )
            return;

        const playerIndex = room.players.findIndex((player) => player.socketId === socket.id);
        room.players[ playerIndex ].ready = true;
        room.players[ playerIndex ].walletAddress = walletAddress;

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

    const handleCurrentItem = ( params, socket ) => {
        const { currentItem } = params;
        const roomIndex = getRoomIndexFromId( socket.roomId );

        rooms[roomIndex].matchStatus.currentItem = currentItem;
    }

    const handleSendDrawRequest = ( params, socket ) => {
        socket.broadcast.to( socket.roomId ).emit( packet.socketEvents['SC_SendDrawRequest'] );
    }

    const handleReplyDrawRequest = ( params, socket ) => {
        const { isAgree } = params;
        const roomIndex = getRoomIndexFromId( socket.roomId );

        if( rooms[roomIndex] && isAgree ) {
            rooms[roomIndex].status = packet.roomStatus['finished'];
            
            if( rooms[roomIndex].matchStatus && rooms[roomIndex].matchStatus.timeInterval )
                clearInterval( rooms[roomIndex].matchStatus.timeInterval );

            io.sockets.to( socket.roomId ).emit( packet.socketEvents['SC_DrawMatch'] );
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

                            
                    // database integration
                    if( rooms[roomIndex] && rooms[roomIndex].status === packet.roomStatus['inProgress'] ) {
                        const roomInfo = { ...rooms[roomIndex] };

                        if( !roomInfo.friendMatch ) {
                            const winner = roomInfo.matchStatus.white === socket.id ? roomInfo.matchStatus.black : roomInfo.matchStatus.white;
                            const loser = socket.id;
                            const winnerName = roomInfo.players[0].socketId === winner ? roomInfo.players[0].walletAddress : roomInfo.players[1].walletAddress;
                            const loserName = roomInfo.players[0].socketId === loser ? roomInfo.players[0].walletAddress : roomInfo.players[1].walletAddress;
                            const roomName = roomInfo.roomName;

                            addRankRecord( winnerName, loserName, roomName );
                        }
                    }

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
        socket.on(packet.socketEvents['CS_Ready'], ( params ) => handleReadyMatch( params, socket ));
        socket.on(packet.socketEvents['CS_CurrentItem'], (params) => handleCurrentItem(params, socket));
        socket.on(packet.socketEvents['CS_SendDrawRequest'], (params) => handleSendDrawRequest(params, socket));
        socket.on(packet.socketEvents['CS_ReplyDrawRequest'], (params) => handleReplyDrawRequest(params, socket));
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

        const king = game.board.configuration.turn === 'white' ? 'K' : 'k';
        let isKing = false;
        for( const i in game.board.configuration.pieces ) {
            if( game.board.configuration.pieces[i] === king )
                isKing = true;
        }

        return totalCount === 0 || game.board.configuration.isFinished || !isKing;
    }

    const getRandomItems = (game) => {
        const count = 3 + helper.getRandomVal(2);   // get val 3 ~ 4

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

                if( type === packet.items['springPad'] ) {
                    let kingmoves = [];

                    for( const j in game.board.configuration.pieces ) {
                        const piece = game.board.configuration.pieces[ j ];
                        if( piece === 'K' || piece === 'k' ) {
                            const moves = game.board.getPieceMoves( piece, j );
                            moves.forEach((item) => kingmoves.push(item));
                        }
                    }

                    const kingMoveIdx = kingmoves.findIndex((item) => item === fen);

                    if( kingMoveIdx !== -1 )
                        continue;
                }

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

    const checkIfGetItem = (room, to, socket, piece) => {
        const itemIndex = room.matchStatus.randomItems.findIndex((item) => item.position === to);
        if( itemIndex !== -1 ) {   // get the item
            if( !room.matchStatus.items )
                room.matchStatus.items = {};

            const currentTurn = piece === piece.toUpperCase() ? 'white' : 'black';
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

                    if( matrixIndex.rowIndex < 0 || matrixIndex.rowIndex > 7 ) {
                        return;
                    }

                    // move to position
                    const fromPosition = to;
                    const toPosition = helper.getFenFromMatrixIndex( matrixIndex.rowIndex, matrixIndex.colIndex );

                    checkIfGetItem(room, toPosition, socket, piece);

                    const chessmanFrom = game.board.getPiece(fromPosition)

                    Object.assign(game.board.configuration.pieces, { [toPosition]: chessmanFrom });
                    delete game.board.configuration.pieces[ fromPosition ];
            
                    const kingFen = {};
                    for( const i in room.matchStatus.game.board.configuration.pieces ) {
                        const n = room.matchStatus.game.board.getPiece(i);
                        if( room.matchStatus.game.board.isKing(n) ) {
                            kingFen[n] = i;
                        }
                    }
            
                    const dangerKing = {
                        'K': room.matchStatus.game.board.isPieceUnderAttack( kingFen['K'] ),
                        'k': room.matchStatus.game.board.isPieceUnderAttack( kingFen['k'] ),
                    };

                    io.sockets.to( room.id ).emit( packet.socketEvents['SC_PerformMove'], { from: fromPosition, to: toPosition, dangerKing, castling: {} } );
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

        const data = {
            randomItems: room.matchStatus.randomItems, 
            userItems: room.matchStatus.items,
            obstacleArray: room.matchStatus.obstacleArray
        };

        io.sockets.to( room.id ).emit( packet.socketEvents['SC_ItemInfo'], data );
    }

    const changeGameTurn = ( roomIndex ) => {
        rooms[roomIndex].matchStatus.game.board.configuration.turn = rooms[roomIndex].matchStatus.game.board.configuration.turn === 'white' ? 'black' : 'white';
    }

    const getRoomPrice = ( roomName ) => {
        if( roomName === 'Classic Room' ) {
            return 0;
        } else if( roomName === 'Silver Room' ) {
            return 50;
        } else if( roomName === 'Gold Room' ) {
            return 100;
        } else if( roomName === 'Platinum Room' ) {
            return 200;
        } else if( roomName === 'Diamond Room' ) {
            return 500;
        }
    }

    const addRankRecord = async ( winnerName, loserName, roomName ) => {
        const roomPrice = getRoomPrice( roomName );

        let old = await RankModel.findOne({ username: winnerName });
        if( !old ) {
            await new RankModel({
                username: winnerName,
                won: 1,
                lost: 0,
                earn: roomPrice * 2 * 98 / 100,
            }).save();
        } else {
            old.won = old.won + 1;
            old.earn = old.earn + roomPrice * 2 * 98 / 100;
            old.save();
        }

        old = await RankModel.findOne({ username: loserName });
        if( !old ) {
            await new RankModel({
                username: loserName,
                won: 0,
                lost: 1,
                earn: -roomPrice,    //
            }).save();
        } else {
            old.lost = old.lost + 1;
            old.earn = old.earn - roomPrice;
            old.save();
        }
    }
};
