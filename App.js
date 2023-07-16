const express=require('express');
const bcryptjs=require('bcryptjs');
const jwt=require('jsonwebtoken');
const cors=require('cors');
const io=require('socket.io')(8000,{
    cors:{
        origin:process.env.CLIENT_URL || 'http://localhost:3000',
        methods:['GET','POST']
    }
})
//Import files
const Users=require('./models/Users')
const Conversations=require('./models/Conversations')
const Messages=require('./models/Messages');

//db connect
require('./connection')
//app use
const app=express();
const port=process.env.PORT || 3002
app.use(express.json());
app.use(express.urlencoded({extended:false}));
app.use(cors())
//Routes
let users=[]
io.on('connection',socket=>{
    console.log('user connected',socket.id);
    socket.on('addUser',userId=>{
        const isUserExit=users.find(user => user.userId ===userId);
        if(!isUserExit){
            const User={userId,socketId:socket.id}
            users.push(User);
            io.emit('getUsers',users)

        }
    });
    socket.on('sendmessage',async({senderId,receiverId,message,conversationId})=>{
        const receiver=users.find(user =>user.userId===receiverId);
        const sender=users.find(user=>user.userId===senderId);
        const user =await Users.findById(senderId);
     console.log(senderId,receiverId,conversationId,message)
        if(receiver){
         io.to(receiver.socketId).to(sender.socketId).emit('getmessage',{
                senderId,
                message,
                conversationId,
                receiverId,
                user:{id:user._id,fullName:user.fullName,email:user.email}
            })
        }else{
            io.to(sender.socketId).emit('getmessage',{
                senderId,
                message,
                conversationId,
                receiverId,
                user:{id:user._id,fullName:user.fullName,email:user.email}
            })

        }
    });
    socket.on('disconnect',()=>{
        users=users.filter(user =>user.socketId !==socket.id);
        io.emit('getUsers',users)
    })
})
app.get('/h',(req,res)=>{
    return res.status(200).send('welcome')
})
app.post('/api/register',async(req,res,next)=>{
    try {
        const {fullName,email,password}=req.body;
        if(!fullName || !email || !password){
            res.status(400).send('please fill all the required fields')
        }else{
            const AlreadyExits=await Users.findOne({email});
            if(AlreadyExits){
                res.status(400).send('User already exits')
            }else{
                const newUser=new Users({fullName,email})
                bcryptjs.hash(password,10,(err,hashedPassword)=>{
                    newUser.set('password',hashedPassword);
                    newUser.save();
                    next()
                })
                return res.status(200).send('User registered successfully')
            }
        }
        
    } catch (error) {
        console.log(error,'error')
    }
})

app.post('/api/login',async(req,res)=>{
    try {
        const {email,password}=req.body;
        if( !email || !password){
            res.status(400).send('please fill all the required fields')
        }else{
            const user=await Users.findOne({email});
            if(!user){
                res.status(400).send('email or password is incorrect');
            }else{
                const validate=bcryptjs.compare(password,user?.password);
                if(!validate){
                    res.status(400).send('email or password is incorrect');                
                }else{
                    const payload={
                        userId:user._id,
                        email:user.email
                    }
                    const JWT_SECRET_KEY=process.env.JWT_SECRET_KEY || 'THIS_IS_A_JWT_SECRET_KEY';
                    jwt.sign(payload,JWT_SECRET_KEY,{expiresIn:86400},async(err,token)=>{
                        await Users.updateOne({ _id:user._id },{
                            $set:{token}
                        })
                        await user.save();
                    return  res.status(200).json({user:{id:user._id,email:user.email,fullName:user.fullName},token:token})

                    })
                   
                }
            }
        }
    } catch (error) {
        console.log(error,'error')
    }
});
app.post('/api/conversation',async(req,res)=>{
    try {
        const {senderId,recieverId}=req.body;
    const newConversation=  new Conversations({members:[senderId,recieverId]});
    await newConversation.save();
   res.status(200).send('conversation created successfully')
    } catch (error) {
        console.log('error',error)
    }
})
app.get('/api/conversation/:userId',async(req,res)=>{
    try {
    const userId=req.params.userId;
    const conversations=await Conversations.find({members:{$in:[userId]}});
    const conversationUserData=Promise.all(conversations.map(async(conversation)=>{
        const recieverId=conversation.members.find((member)=>member !== userId)
   const user=await Users.findById(recieverId)
   return {user:{receiverId:user._id,fullName:user.fullName,email:user.email},conversationId:conversation._id}
    }))
    
    res.status(200).json( await conversationUserData)
   
    } catch (error) {
        console.log('error',error)
    }
})

app.post('/api/message',async(req,res)=>{
    try {
    const {senderId,message,conversationId,recieverId=''}=req.body;
    if(!senderId || !message) return res.status(400).send('please fill all the reqired fields');
    if(conversationId ==='new' && recieverId){
        const newConversation=new Conversations({members:[senderId,recieverId]});
        await newConversation.save();
        const newMessage=new Messages({conversationId:newConversation._id,senderId,message});
       await newMessage.save();
     return res.status(200).send('Message sent successfully')
    

    }else if(!conversationId && !recieverId){
      return res.status(400).send('please fill all the reqired fields');
    }
    const newMessage=new Messages({conversationId,senderId,message});
     await newMessage.save();
     
    res.status(200).send('Message sent successfully')
    } catch (error) {
        console.log('error',error)
    }
});
app.get('/api/message/:conversationId',async(req,res)=>{
    try {
   
    const checkMessages=async(conversationId)=>{
    const messages=await Messages.find({conversationId});
    const messageUserData=Promise.all(messages.map(async(message)=>{
        const user=await Users.findById(message.senderId);
        return {user:{id:user._id,fullName:user.fullName,email:user.email},message:message.message}
    }))
    res.status(200).send(await messageUserData)
}
    const conversationId=req.params.conversationId;
    if(conversationId ==='new'){
        const checkconvo=await Conversations.find({members:{$all:[req.query.senderId,req.query.recieverId]}})
        if(checkconvo.length>0){
            checkMessages(checkconvo[0]._id)
        }else{
            return res.status(200).json([])
        }
    }else{
        checkMessages(conversationId)
    }

    } catch (error) {
        console.log('error',error)
    }
})
app.get('/api/users/:userId',async(req,res)=>{
    try {
        const userId=req.params.userId
        const users=await Users.find({_id:{$ne:userId}});
        const userData=Promise.all(users.map((user)=>{
        return {user:{fullName:user.fullName,email:user.email,recieverId:user._id}}
        }))
    res.status(200).json( await userData)
    } catch (error) {
      console.log('error',error)  
    }
    
})
app.listen(port,()=>{
    console.log('server running on port'+port)
})