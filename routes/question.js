/**
 * Created by hama on 2017/9/18.
 */
const setting = require('../setting');
const mapping = require('../static');
const validator = require('validator');
//引入问题表
const Question = require('../model/Question');
//引入用户表
const User = require('../model/User');
//引入reply表
const Reply = require('../model/Reply');
//引入at模块
const at = require('../common/at');
//新建问题的处理函数
exports.create = (req,res,next)=>{
    res.render('create-question',{
        title:'新建问题',
        layout:'indexTemplate',
        categorys:setting.categorys
    })
}
//新建行为的处理函数
exports.postCreate = (req,res,next)=>{
    let title = validator.trim(req.body.title);
    let category = validator.trim(req.body.category);
    let content = validator.trim(req.body.content);
    let error;
    if(!validator.isLength(title,{min:8,max:20})){
        error = '标题长度不合法,请重新输入';
    }
    if(!validator.isLength(content,{min:10})){
        error = '问题内容长度不合法,请重新输入';
    }
    if(error){
        return res.end(error);
    }else{
        //验证成功后
        req.body.author = req.session.user._id;
        let newQuestion = new Question(req.body);
        newQuestion.save().then(question=>{
            //某个人发布一篇文章，积分+5,发布数量+1
            User.getUserById(req.session.user._id,(err,user)=>{
                if(err){
                    return res.end(err);
                }
                user.score += 1;
                user.article_count += 1;
                user.save();
                req.session.user = user;
                //返回的是一个添加问题的页面地址。
                res.json({url:`/question/${question._id}`})
            })
            //发送at消息
            at.sendMessageToMentionUsers(content,question._id,req.session.user._id,(err,msg)=>{
              if(err){
                  console.log(err);
              }
              return;
            });
        }).catch(err=>{
            return res.end(err);
        })
    }
}
//编辑问题的处理函数
exports.edit = (req,res,next)=>{
    let question_id = req.params.id;
    // console.log(question_id);
    Question.getFullQuestion(question_id,(err,article)=>{
        console.log(article);
        res.render('edit-question',{
            title:'新建问题',
            layout:'indexTemplate',
            categorys:setting.categorys,
            question:article
        })
    })
}
//编辑行为的处理函数
exports.postEdit = (req,res,next)=>{
    let question_id = req.params.id;
    let title = validator.trim(req.body.title);
    let category = validator.trim(req.body.category);
    let content = validator.trim(req.body.content);
    Question.getFullQuestion(question_id,(err,article)=>{
        let question = new Question(article);
        question.content = content;
        question.title = title;
        question.category = category;
        question.save().then(result=>{
            // console.log(result);
        })
        res.json({url:`/question/${question._id}`})
    })
}
//删除行为的处理函数
exports.delete = (req,res,next)=>{

}
//查询问题的处理函数
exports.index = (req,res,next)=>{
    //问题的ID
    let question_id = req.params.id;
    //当前登录的用户
    let currentUser = req.session.user;
    //1.问题的信息
    //2.问题的回复信息
    //3.问题作者的其他相关文章推荐
    Question.getFullQuestion(question_id,(err,question)=>{
        if(err){
            return res.end(err);
        }
        if(question == null){
            return res.render('error',{
                title:'错误页面',
                resource:mapping.userSetting,
                layout:'indexTemplate',
                message:'该问题不存在或者已经被删除',
                error:''
            })
        }
        //给问题的内容如果有@用户 ，给@用户添加一个链接
        question.content = at.linkUsers(question.content);
        //问题的访问量+1
        question.click_num += 1;
        question.save();
        //来获取文章对应的所有的回复
        //reply表
        Reply.getRepliesByQuestionIdFive(question._id,(err,replies)=>{
            if(replies.length > 0){
                replies.forEach((reply,index)=>{
                    reply.content = at.linkUsers(reply.content)
                })
            }
            //获取文章作者的其他文章
            Question.getOtherQuestions(question.author._id,question._id,(err,questions)=>{
                //如果当前有用户登录，顺便查询一个这篇文章有没有被当前用户关注过
                if(currentUser){
                    User.findOne({_id:currentUser._id}).then(result=>{
                        let followQ = false;
                        if(result.followQustion.indexOf(question_id) == -1){
                            followQ = true;
                        }
                        return followQ;
                    }).then(followQ=>{
                        return res.render('question',{
                            title:'问题详情页面',
                            layout:'indexTemplate',
                            question:question,
                            others:questions,
                            replies:replies,
                            currentUser:currentUser,
                            followQ:followQ
                        })
                    }).catch(err=>{
                        console.log(err)
                    });
                }else {   //如果用户没有登录就直接点击查看问题
                    return res.render('question',{
                        title:'问题详情页面',
                        layout:'indexTemplate',
                        question:question,
                        others:questions,
                        replies:replies,
                        followQ:123,
                        currentUser:456,
                    })
                }
            })
        })
    })
}
exports.padingPageOne = (req,res,next)=>{
    let question_id = req.params.question_id;
    Reply.getRepliesByQuestionId(question_id,(err,replis)=>{
        return res.render('replyOnePage',{
            layout:'',
            replies:replis
        });
    })
}
//用户关注取关文章
exports.questionAttention = (req,res,next)=>{

    let question_id = req.params.question_id;
    let user_id = req.session.user._id;
    Question.findOne({_id:question_id}).then(question=> {
        if(question.author==user_id){
            return res.json({num: question.follow_num});
        }else {
            User.findOne({_id:user_id}).then(user=>{
                let off = user.followQustion.indexOf(question_id) == -1;
                let aa = {a:user,b:off};
                return aa;
            }).then(off=>{
                let user =  off.a;
                if(off.b) {
                    user.followQustion.push(question_id);
                    user.save();
                    Question.findOne({_id:question_id}).then(question=> {
                        question.follow_num += 1;
                        question.save();
                        return res.json({num: question.follow_num});
                    }).catch(err => {
                        res.end('关注出错')
                    })
                }else {
                    Array.prototype.removeByValue = function(val) {
                        for(var i=0; i<this.length; i++) {
                            if(this[i] == val) {
                                this.splice(i, 1);
                                break;
                            }
                        }
                    }

                    user.followQustion.removeByValue(question_id);
                    user.save();
                    Question.findOne({_id:question_id}).then(question=>{
                        question.follow_num -=1;
                        question.save();
                        return res.json({num:question.follow_num});
                    }).catch(err=>{
                        res.end('取消关注出错');
                    })
                }
            }).catch(err=>{
                res.end(err);
            })
        }

    })

}
