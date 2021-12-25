module.exports = function (server) {
    const packet = require('./packet');
    const helper = require('./util');

    var io = require('socket.io').listen(server);
    const jsChessEngine = require('js-chess-engine')

    console.log('Socket.io server running:');

    const rooms = [];
    const users = [];

    const handleCreateRoom = (params, socket) => {
        const roomId = createNewRoom( params.friendMatch, socket, params.username );

        socket.emit( packet.socketEvents['SC_RoomCreated'], { roomId: roomId } );
    }

    const  handleJoinRoom = (params, socket) => {
        const roomIndex = getRoomIndexFromId( params.roomId );
        if( roomIndex === -1 || rooms[roomIndex].players.length === 0 ) {    // when room doesn't exist, create the match matching room
            createNewRoom( false, socket, params.username );
        } else if( rooms[roomIndex].players.length > 1 ) {  // already more than 2 players on the room
            socket.emit( packet.socketEvents['SC_ForceExit'], { message: 'Another player already joined.' } );
        } else {
            rooms[roomIndex].players.push({
                socketId: socket.id,
                username: params.username
            });
            const whiteIndex = helper.getRandomVal(2);
            const blackIndex = whiteIndex === 0 ? 1 : 0;

            rooms[roomIndex].matchStatus = {
                game: new jsChessEngine.Game(),
                white: rooms[roomIndex].players[ whiteIndex ].socketId,
                black: rooms[roomIndex].players[ blackIndex ].socketId,
            }

            socket.join(rooms[roomIndex].id);
            socket.username = params.username;
            socket.roomId = rooms[roomIndex].id;

            io.sockets.to( rooms[roomIndex].id ).emit( packet.socketEvents['SC_GameStarted'], { white: rooms[roomIndex].matchStatus.white, black: rooms[roomIndex].matchStatus.black } );

            const currentTurn = rooms[roomIndex].matchStatus.game.board.configuration.turn;
            const currentPlayer = rooms[roomIndex].matchStatus[ currentTurn ];
            io.sockets.to( rooms[roomIndex].id ).emit( packet.socketEvents['SC_ChangeTurn'], { currentTurn, currentPlayer } );

            rooms[roomIndex].status = packet.roomStatus['inProgress'];
        }
    }

    const handleSelectPiece = ( params, socket ) => {
        const roomIndex = getRoomIndexFromId( socket.roomId );
        const currentTurn = rooms[roomIndex].matchStatus.game.board.configuration.turn;
        const currentPlayer = rooms[roomIndex].matchStatus[ currentTurn ];

        if( socket.id !== currentPlayer ) { // only accept the turn player message
            return;
        }

        const { fen } = params;
        const possibleMoves = rooms[roomIndex].matchStatus.game.moves(fen);

        io.sockets.to( rooms[roomIndex].id ).emit( packet.socketEvents['SC_SelectPiece'], { fen, possibleMoves } );
    }

    const handlePerformMove = ( params, socket ) => {
        const { from, to } = params;
        const roomIndex = getRoomIndexFromId( socket.roomId );

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
            return;
        }

        rooms[roomIndex].matchStatus.game.move(from, to);
        io.sockets.to( rooms[roomIndex].id ).emit( packet.socketEvents['SC_PerformMove'], { from, to, castling } );

        changeTurn(roomIndex);
    }

    const handlePawnTransform = ( params, socket ) => {
        const roomIndex = getRoomIndexFromId( socket.roomId );
        const { from, to, pieceType } = params;

        rooms[roomIndex].matchStatus.game.move( from, to );
        rooms[roomIndex].matchStatus.game.setPiece( to, pieceType );

        io.sockets.to( rooms[roomIndex].id ).emit( packet.socketEvents['SC_PerformMove'], { from, to, castling: {}, pieceType } );

        changeTurn(roomIndex);
    }

    const changeTurn = (roomIndex) => {
        const currentTurn = rooms[roomIndex].matchStatus.game.board.configuration.turn;
        const currentPlayer = rooms[roomIndex].matchStatus[ currentTurn ];

        const isFinished = rooms[roomIndex].matchStatus.game.board.configuration.isFinished;
        if( isFinished )
            rooms[roomIndex].status = packet.roomStatus['finished'];

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

        io.sockets.to( rooms[roomIndex].id ).emit( packet.socketEvents['SC_ChangeTurn'], { moves, game: rooms[roomIndex].matchStatus.game, currentTurn, currentPlayer, isFinished, lastMoveHistory, dangerKing } );
    }

    const handleUnSelectPiece = ( params, socket ) => {
        io.sockets.to(socket.roomId).emit( packet.socketEvents['SC_UnSelectPiece'] );
    }

    const handleDisconnect = (socket) => {
        if( socket.roomId ) {
            const roomIndex = getRoomIndexFromId( socket.roomId );
            if( roomIndex !== -1 && rooms[roomIndex] ) {
                const playerIndex = rooms[roomIndex].players.findIndex((item) => item.socketId === socket.id);

                rooms[roomIndex].players.splice(playerIndex, 1);
    
                if( rooms[roomIndex].players.length > 0 ) { // only one player disconnect
                    io.sockets.to(socket.roomId).emit( packet.socketEvents['SC_PlayerLogOut'], { username: socket.username } );
                    if( rooms[roomIndex] )
                        rooms[roomIndex].status = packet.roomStatus['waiting'];
                } else {    // no player in the room
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
    
    const createNewRoom = (friendMatch, socket, username) => {
        const roomId = getNewRoomId();
        const status = packet.roomStatus['waiting'];
        const players = [{
            socketId: socket.id,
            username: username
        }];
        
        const roomInfo = {
            id: roomId,
            players,
            friendMatch,
            status
        };

        rooms.push(roomInfo);

        socket.join(roomId);
        socket.username = username;
        socket.roomId = roomId;

        return roomId;
    }
};
