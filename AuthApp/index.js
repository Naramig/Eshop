const express = require('express');
const { Client } = require('pg');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const CryptoJS = require("crypto-js");
const grpc = require('grpc');
const protoLoader = require('@grpc/proto-loader');

//gRPC Settings
var PROTO_PATH = __dirname + '/test.proto';
var packageDefinition = protoLoader.loadSync(
  PROTO_PATH,
  {keepCase: true,
   longs: String,
   enums: String,
   defaults: true,
   oneofs: true
  });
var proto = grpc.loadPackageDefinition(packageDefinition);

const app = express()
app.use(bodyParser.json());

var env = process.env.NODE_ENV || 'development';
var config = require('./config')[env];

//Connection to DB
const client = new Client(config.database);
client.connect();

async function CheckKey(key) {
  var userId = await client.query("SELECT \"User\".id FROM \"Session\" " +
               " INNER JOIN \"User\" ON \"User\".id = \"Session\".user_id " + 
               " WHERE \"Session\".key = $1 AND \"Session\".creation_date + interval '10 minutes' >= now()",
               [key.toString()]);
  return userId;
}


async function CheckSession(call, callback) {
  try{
    var key = call.request.session_key;
    console.log("Here");
    var userId = await CheckKey(key.toString());
    if(userId.err)
      throw err;
    else if(userId.rows.length == 0)
      throw new Error('Session expired or does not exist');
    callback(null, {user_id: userId.rows[0].id});
  }catch(err){
    callback(err, {message: ''});
  }
}

async function Signup(call, callback) {
  try{
    var login = call.request.login;
    var password = call.request.password;
    if(!login || !password){
      throw new Error('Provide login and password correctly');
    }
    checkUsersLogin = await client.query("SELECT * FROM \"User\" WHERE login = $1", [login]);
    if(checkUsersLogin.rows.length != 0){
      throw new Error('Change your login');
    }
    var passwordHash = await bcrypt.hash(password, 10);
    await client.query("INSERT INTO \"User\" (login, password) values($1, $2)", [login, passwordHash]);
    callback(null, {message: 'Inserted'});
  }catch(err){
    callback(err, {message: ''});
  }
}

async function Signin(call, callback) {
  try{
    var login = call.request.login;
    var password = call.request.password;

    var userInfo = await client.query("SELECT * FROM \"User\" WHERE login = $1", [login]);
    if( userInfo.rows.length == 0){
      throw new Error('Login does not exist');
    }
    var userId =  userInfo.rows[0].id;
    var isPasswordCorrect = await bcrypt.compare(password, userInfo.rows[0].password);
    if(!isPasswordCorrect){
      throw new Error('Login or Password is incorrect');
    }
    var salt = CryptoJS.lib.WordArray.random(128 / 8);
    var key128Bits = CryptoJS.PBKDF2("Secret Passphrase", salt, { keySize: 128 / 32});

    await client.query("INSERT INTO \"Session\" (key, user_id) values($1, $2)", [key128Bits.toString(), userId]);
    console.log(key128Bits.toString());
    callback(null, {session_key: key128Bits.toString()});
  }catch(err){
    callback(err, {message: ''});
  }
}

var server = new grpc.Server();

server.addService(proto.Authentication.service, {signup: Signup, signin: Signin, checkSession: CheckSession});
server.bind('localhost:' + config.server.port, grpc.ServerCredentials.createInsecure());
console.log("Server running at port " + config.server.port);
server.start();


