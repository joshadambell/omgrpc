'use strict';

let grpc = require('grpc')
const path = require('path');

angular
  .module('app')
  .service('GrpcSvc', GrpcSvc);

GrpcSvc.$inject = [];

function GrpcSvc() {
    var state = {
        protos: [],
        servicesByServiceID: {}
    }

    function parseServices(proto) {
        var services = [];

        Object.keys(proto)
            .filter(function(key){
                return key != "$$hashKey"
            })
            .map(function(pkgName){
                return proto[pkgName];
            })
            .forEach(function(pkg){
                Object.keys(pkg)
                    .filter(function(key){
                        return pkg[key].service
                    })
                    .forEach(function(key){
                        var svc = {
                            id: key,
                            name: key,
                            client: pkg[key]
                        }
                        services.push(svc);

                        state.servicesByServiceID[key] = svc;
                    });
            });

        return services;
    }

    function findRoot(root, relPath, attempts) {
        var parsed
        try {
            var file = {
                root: root,
                file: relPath
            };

            ///Users/troyshields/go/src/github.com/weave-lab/data-service/vendor/github.com/golang/protobuf/ptypes/empty
            debugger;
            parsed = grpc.load(file);
        } catch (e) {
            if (attempts > 0) {
                let newRoot = path.dirname(root);
                let newRelPath = path.join(root, relPath).replace(newRoot, "");

                if (newRelPath[0] == path.sep) {
                    newRelPath = newRelPath.substring(1);
                }

                return findRoot(newRoot, newRelPath, attempts-1);
            }

            debugger;
            throw (e);
        }

        return parsed
    }

    function parseProtofile(protoFile) {
        let parsed = findRoot(path.dirname(protoFile.path), protoFile.name, protoFile.path.split(path.sep).length);

        parsed.services = parseServices(parsed)
        parsed.id = parsed.$$hashKey;

        state.protos.push(parsed)

        return parsed
    }

    function getService(serviceID) {
        return state.servicesByServiceID[serviceID];
    }

    function parseResolvedType(grpcType) {
        var fields = grpcType._fields.map(function(f){
            var t
            if (f.resolvedType) {
                t = parseResolvedType(f.resolvedType);
            } else {
                t = f.type.name;
            }
            return {
                name: f.name,
                type: t,
                defaultValue: f.defaultValue,
                repeated: f.repeated,
                required: f.required
            }
        });

        return {
            fields: fields,
            typeName: grpcType.name
        }
    }

    function createClient(serviceID, addr) {
        var svc = getService(serviceID);

        // TODO - SSL
        var creds = grpc.credentials.createInsecure();

        var client = new svc.client(addr, creds);

        client.methods = [];

        var methodCache = {};

        for(var p in client) {
            if(typeof client[p] === "function") {
                methodCache[p.toLowerCase()] = {
                    name: p
                };
            }
        }

        svc.client.service.children.forEach(function(child){
            if (child.className==="Service.RPCMethod") {
                var m = methodCache[child.name.toLowerCase()]

                if (!m) {
                    console.log("Couldn't find method on client", child.name)
                    return
                }

                m.requestType = {};
                m.responseType = {};

                m.requestType.type = parseResolvedType(child.resolvedRequestType);
                m.responseType.type = parseResolvedType(child.resolvedResponseType);

                client.methods.push(m);
            }
        });


        return client;
    }

    // parseProtofile({path:"/Users/troyshields/projects/omgrpc/exampleSvc/example.proto", name:"example.proto"})

    return {
        parseProtofile: parseProtofile,
        // getGrpcClient: getGrpcClient
        getProtos: function() {
            return state.protos
        },

        getService: getService,
        createClient: createClient
    }
}