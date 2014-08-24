/*
    MediaCenterJS - A NodeJS based mediacenter solution

    Copyright (C) 2014 - Jan Smolders

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/
'use strict';

(function(window) {

    var musicApp = angular.module('musicApp', ['ui.bootstrap']);

    function createDropDirective(ngevent, jsevent) {
        musicApp.directive(ngevent, function ($parse) {
            return function ($scope, element, attrs) {
                var expressionHandler = $parse(attrs[ngevent]);
                element.on(jsevent, function(ev) {
                    $scope.$apply(function() {
                        expressionHandler($scope, {$event:ev});
                    });
                });
        }
        });
    }
    createDropDirective('ngOnDragBegin', 'dragstart');
    createDropDirective('ngOnDrop', 'drop');
    createDropDirective('ngOnDragOver', 'dragover');

    window.musicCtrl = function($scope, $http, player, $modal, audio) {
        $scope.player = player;
        $scope.focused = 0;
        $scope.serverMessage = 0;
        $scope.serverStatus= '';
        $scope.className = "normal";

        $http.get('/music/load').success(function(data) {
            $scope.albums = data;
            angular.forEach($scope.albums, function(album) {
                album._type = 'album';
                angular.forEach(album.tracks, function(track) {
                     track.album = album;
                     track._type = 'track';
                });
            });
        });
        $scope.draggedIndex = null;
        $scope.startDrag = function(index) {
            $scope.draggedIndex = index;
        };
        $scope.onDrop = function(index) {
            if ($scope.draggedIndex != null) {
                var temp = $scope.player.playlist[index];
                $scope.player.playlist[index] = $scope.player.playlist[$scope.draggedIndex];
                $scope.player.playlist[$scope.draggedIndex] = temp;
            }
        }
        $scope.changeSelected = function(album){
            $scope.focused = $scope.albums.indexOf(album);
        }

        $scope.fullscreen = function() {
            if ($scope.className === "normal"){
                $scope.className = "fullscreen";
            } else {
                $scope.className = "normal";
            };
        }

        $scope.open = function (album) {
            var modalInstance = $modal.open({
                templateUrl: 'editModal.html',
                controller: ModalInstanceCtrl,
                size: 'md',
                resolve: {
                    current: function () {
                        return album;
                    }
                }
            });
        }

        var ModalInstanceCtrl = function ($scope, $modalInstance, current) {
            $scope.edit ={};
            $scope.current = current;

            $scope.cancel = function () {
                $modalInstance.dismiss('cancel');
            };

            $scope.editItem = function(){

                if($scope.edit.artist === '' || $scope.edit.artist === null || $scope.edit.artist === undefined ){
                    if($scope.current.artist  !== undefined || $scope.current.artist !== null){
                        $scope.edit.artist = $scope.current.artist;
                    } else {
                        $scope.edit.artist = '';
                    }
                }

                if($scope.edit.title === '' || $scope.edit.title === null || $scope.edit.title === undefined ){
                    if($scope.current.album  !== undefined || $scope.current.album !== null){
                        $scope.edit.title = $scope.current.album;
                    } else {
                        $scope.edit.title = '';
                    }
                }

                if($scope.edit.thumbnail === '' || $scope.edit.thumbnail === null || $scope.edit.thumbnail === undefined ){
                    if($scope.current.cover  !== undefined || $scope.current.cover !== null){
                        $scope.edit.thumbnail = $scope.current.cover;
                    } else {
                        $scope.edit.thumbnail = '/music/css/img/nodata.jpg';
                    }
                }

                $http({
                    method: "post",
                    data: {
                        newArtist    : $scope.edit.artist,
                        newTitle     : $scope.edit.title,
                        newThumbnail : $scope.edit.thumbnail,
                        currentAlbum : $scope.current.album
                    },
                    url: "/music/edit"
                }).success(function(data, status, headers, config) {
                    location.reload();
                });
            }
        };



        var setupSocket = {
            async: function() {
                var promise = $http.get('/configuration/').then(function (response) {
                    var configData  = response.data;
                    var socket      = io.connect(configData.localIP + ':'+configData.remotePort, {'force new connection': true});
                    socket.on('connect', function(data){
                        socket.emit('screen');
                    });
                    return {
                        on: function (eventName, callback) {
                            socket.on(eventName, function () {
                                var args = arguments;
                                $scope.$apply(function () {
                                    callback.apply(socket, args);
                                });
                            });

                        },
                        emit: function (eventName, data, callback) {
                            socket.emit(eventName, data, function () {
                                var args = arguments;
                                $scope.$apply(function () {
                                    if (callback) {
                                        callback.apply(socket, args);
                                    }
                                });
                            });
                        }
                    };
                    return data;
                });
                return promise;
            }
        };


        setupSocket.async().then(function(data) {
            if (typeof data.on !== "undefined") {
                $scope.remote       = remote(data, $scope, player, audio);
                $scope.keyevents    = keyevents(data, $scope, player, audio);
            }
        });

        $scope.orderProp = 'genre';
    };


    musicApp.factory('audio', function($document) {
        var audio = $document[0].createElement('audio');
        return audio;
    });

    musicApp.factory('player', function(audio,  $rootScope) {
        var player,
            playlist = [],
            paused = false,
            currentTrack = null,
            current = {
                itemIdx: -1,
                subItemIdx: -1
            };

        player = {
            playlist: playlist,
            current: current,
            currentTrack: currentTrack,
            playing: false,
            play: function(subItemIdx, itemIdx) {
                if (!playlist.length){
                    return;
                }
                if (angular.isDefined(itemIdx)) {
                   current.itemIdx = itemIdx;
                }
                if (angular.isDefined(subItemIdx)) {
                    current.subItemIdx = subItemIdx;
                }

                if (!paused){
                    var currentItem = playlist[current.itemIdx];
                    if (currentItem._type === 'track') {
                        player.currentTrack = currentItem;
                    } else if (currentItem._type === 'album') {
                        player.currentTrack = currentItem.tracks[current.subItemIdx];
                    }

                    audio.src = 'music/'+player.currentTrack.filename +'/play/';
                }
                audio.play();
                player.playing = true;
                paused = false;
            },
            pause: function() {
                if (player.playing) {
                    audio.pause();
                    player.playing = false;
                    paused = true;
                }
            },
            reset: function() {
                player.pause();
                current.itemIdx = -1;
                current.subItemIdx = -1;
            },
            next: function() {
                if (!playlist.length){
                    return;
                }
                paused = false;

                var currentItem = playlist[current.itemIdx];
                if (currentItem._type ==='track') {
                    current.itemIdx++;
                } else if (currentItem._type === 'album') {
                    if (current.subItemIdx + 1 >= currentItem.tracks.length) {
                        current.itemIdx++;
                        current.subItemIdx = 0;
                    } else {
                        current.subItemIdx++;
                    }
                }
                
                if (player.playing) player.play();
            },
            previous: function() {
                if (!playlist.length){
                    return;
                }
                paused = false;
                var currentItem = playlist[current.itemIdx];
                if (current.subItemIdx > 0) {
                    current.subItemIdx--;
                } else {
                    current.itemIdx--;
                    var newItem = playlist[current.itemIdx];
                    if (newItem._type === 'track') {
                        current.subItemIdx = 0;
                    } else if (newItem._type === 'album') {
                        current.subItemIdx = newItem.tracks.length - 1;
                    }
                }
                if (player.playing) player.play();
            }
        };

        playlist.add = function(album) {
            if (playlist.indexOf(album) != -1){
                return;
            }
            playlist.push(album);
        };

        playlist.remove = function(album) {
            var index = playlist.indexOf(album);
            if (index == current.itemIdx){
                player.reset();
            }
            playlist.splice(index, 1);
        };

        audio.addEventListener('ended', function() {
            $rootScope.$apply(player.next);
        }, false);

        audio.addEventListener("timeupdate", function(){
            updateProgress(audio);
        }, false);

        return player;
    });

    function updateProgress(audio) {
       var progress = document.getElementById("progress");
       var value = 0;
       if (audio.currentTime > 0) {
          value = Math.floor((100 / audio.duration) * audio.currentTime);
       }
       progress.style.width = value + "%";
    }

})(window);

